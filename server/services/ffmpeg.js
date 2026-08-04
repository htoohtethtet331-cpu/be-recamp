const { execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const path = require('path');
const fs = require('fs');

// Get audio duration in seconds using ffprobe
const getAudioDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    execFile(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath
    ], (err, stdout) => {
      if (err) return reject(err);
      try {
        const info = JSON.parse(stdout);
        resolve(parseFloat(info.format.duration));
      } catch (e) {
        reject(new Error('Could not parse ffprobe output: ' + e.message));
      }
    });
  });
};

// Run a single ffmpeg command via execFile (avoids fluent-ffmpeg filter quirks)
const runFfmpeg = (args) => {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, (err, stdout, stderr) => {
      if (err) {
        console.error('[ffmpeg error]', stderr);
        return reject(new Error(stderr || err.message));
      }
      resolve();
    });
  });
};

const mixAudioOnly = async (utterances, outputDir, videoDuration) => {
  const finalAudioPath = path.join(outputDir, `final_audio_${Date.now()}.mp3`);

  const MAX_AUDIO_SPEED = 1.15; // nudge voice tempo up to 1.15x max
  const MIN_VIDEO_SPEED = 0.90; // slow video down to 0.90x at worst
  const CROSSFADE_MS = 20;      // 20ms crossfade between segments (CLAUDE.md)

  const videoSegments = [];
  const updatedUtterances = [];
  let lastOriginalEnd = 0;
  let currentNewTime = 0;

  // ── Step 1: per-block timing calculation ──────────────────────────────────
  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i];

    // Gap between previous block and this one — keep as-is, normal speed
    if (u.start / 1000 > lastOriginalEnd + 0.001) {
      const gapDur = (u.start / 1000) - lastOriginalEnd;
      videoSegments.push({
        originalStart: lastOriginalEnd,
        originalEnd: u.start / 1000,
        newDuration: gapDur,
        videoSpeed: 1.0,
        isGap: true,
        audioFilePath: null,
      });
      currentNewTime += gapDur;
    }

    const originalDur = (u.end - u.start) / 1000;
    let audioDur = 0;
    if (u.audioFilePath && fs.existsSync(u.audioFilePath)) {
      audioDur = await getAudioDuration(u.audioFilePath);
    }

    let audioSpeed = 1.0;
    let videoSpeed = 1.0;
    let finalDur = originalDur;

    if (audioDur > originalDur) {
      // Voice longer than scene — fit using CLAUDE.md rule:
      //   nudge voice tempo up (≤ 1.15x), then slow video (≥ 0.90x)
      if (audioDur / MAX_AUDIO_SPEED <= originalDur) {
        // Pure tempo nudge is enough
        audioSpeed = audioDur / originalDur;
        finalDur = originalDur;
      } else {
        // Max out tempo, then stretch the video segment
        audioSpeed = MAX_AUDIO_SPEED;
        const adjustedAudioDur = audioDur / MAX_AUDIO_SPEED;
        const maxAllowedDur = originalDur / MIN_VIDEO_SPEED;

        finalDur = Math.min(adjustedAudioDur, maxAllowedDur);
        videoSpeed = originalDur / finalDur; // will be ≤ 1 (slow-mo)
      }
    } else {
      // Voice shorter — hold: video at normal speed, pad remaining time with silence
      finalDur = originalDur;
      audioSpeed = 1.0;
      videoSpeed = 1.0;
    }

    const newStartSec = currentNewTime;
    currentNewTime += finalDur;

    videoSegments.push({
      originalStart: u.start / 1000,
      originalEnd: u.end / 1000,
      newDuration: finalDur,
      videoSpeed,
      isGap: false,
      audioFilePath: u.audioFilePath,
      audioSpeed,
      text: u.translatedText,
    });

    updatedUtterances.push({
      ...u,
      finalSceneDurSec: finalDur,
      audioSpeed,
      newStartSec,
      newEndSec: currentNewTime,
    });

    lastOriginalEnd = u.end / 1000;
  }

  // ── Final Step: Handle gap after the last utterance ──
  if (videoDuration && videoDuration > lastOriginalEnd) {
    const remainingDur = videoDuration - lastOriginalEnd;
    if (remainingDur > 0) {
      videoSegments.push({
        originalStart: lastOriginalEnd,
        originalEnd: videoDuration,
        newDuration: remainingDur,
        videoSpeed: 1.0,
        isGap: true,
        audioFilePath: null,
      });
      currentNewTime += remainingDur;
    }
  }

  // ── Step 2: render each segment to its own padded mp3 ─────────────────────
  // CLAUDE.md: "N matching segments (voice, tempo-adjusted, padded to the same length)"
  // Segments are independent — render them in parallel for speed
  const segmentFiles = new Array(videoSegments.length);
  const segmentDurations = new Array(videoSegments.length);

  // Concurrency limit — avoid spawning too many ffmpeg processes at once
  const RENDER_CONCURRENCY = 4;

  const renderSegment = async (seg, i) => {
    const segOut = path.join(outputDir, `seg_${i}_${Math.random().toString(36).slice(2, 7)}.mp3`);

    if (seg.isGap || !seg.audioFilePath || !fs.existsSync(seg.audioFilePath)) {
      // Pure silence for gap duration
      await runFfmpeg([
        '-f', 'lavfi',
        '-i', `anullsrc=r=44100:cl=stereo`,
        '-t', seg.newDuration.toFixed(4),
        '-ar', '44100', '-ac', '2',
        '-y', segOut,
      ]);
    } else {
      // Speed-adjust voice, pad with silence to exactly finalDur
      const atempo = Math.min(2.0, Math.max(0.5, seg.audioSpeed));
      await runFfmpeg([
        '-i', seg.audioFilePath,
        '-af', `atempo=${atempo.toFixed(4)},apad,atrim=duration=${seg.newDuration.toFixed(4)}`,
        '-ar', '44100', '-ac', '2',
        '-y', segOut,
      ]);
    }
    segmentFiles[i] = segOut;
    segmentDurations[i] = seg.newDuration;
  };

  // Process in parallel chunks of RENDER_CONCURRENCY
  for (let start = 0; start < videoSegments.length; start += RENDER_CONCURRENCY) {
    const chunk = videoSegments.slice(start, start + RENDER_CONCURRENCY);
    await Promise.all(chunk.map((seg, j) => renderSegment(seg, start + j)));
  }

  // ── Step 3: crossfade-concatenate all segments ───────────────────────────
  // CLAUDE.md: "concatenated with a short (~20ms) crossfade between sentences"
  if (segmentFiles.length === 0) {
    throw new Error('No audio segments to mix');
  }

  if (segmentFiles.length === 1) {
    fs.copyFileSync(segmentFiles[0], finalAudioPath);
  } else {
    // Build a filter_complex that acrossfades every adjacent pair
    // [0][1] -> acrossfade -> [cf0]
    // [cf0][2] -> acrossfade -> [cf1]
    // ...
    // [cf(N-2)] = final output
    let inputArgs = [];
    segmentFiles.forEach(f => {
      inputArgs.push('-i', f);
    });

    let filterParts = [];
    let prev = '0:a';
    for (let i = 1; i < segmentFiles.length; i++) {
      // Clamp crossfade to be safely shorter than both adjacent segments
      // acrossfade requires d <= min(seg[i-1].duration, seg[i].duration)
      const prevDur = segmentDurations[i - 1];
      const curDur = segmentDurations[i];
      const safeCross = Math.min(CROSSFADE_MS / 1000, prevDur * 0.4, curDur * 0.4);
      const crossSec = Math.max(0.001, safeCross).toFixed(4);

      const outLabel = i === segmentFiles.length - 1 ? 'aout' : `cf${i}`;
      filterParts.push(`[${prev}][${i}:a]acrossfade=d=${crossSec}:c1=tri:c2=tri[${outLabel}]`);
      prev = outLabel;
    }

    const filterStr = filterParts.join(';');

    await runFfmpeg([
      ...inputArgs,
      '-filter_complex', filterStr,
      '-map', '[aout]',
      '-ar', '44100', '-ac', '2',
      '-y', finalAudioPath,
    ]);
  }

  // Cleanup segment tmp files
  segmentFiles.forEach(f => { try { fs.unlinkSync(f); } catch (_) { } });

  // Only return non-gap segments to frontend for video retiming.
  // Gap segments are handled in audio only (silence); video between utterances
  // plays at normal speed and is covered by the surrounding trim segments.
  const videoOnlySegments = videoSegments.filter(s => !s.isGap);

  return { finalAudioPath, completeVideoSegments: videoOnlySegments, updatedUtterances };
};

module.exports = { mixAudioOnly };
