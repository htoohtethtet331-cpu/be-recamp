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

  let filterLines = [];
  let amixInputs = [];
  let inputArgs = [];
  let updatedUtterances = [];

  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i];
    if (!u.audioFilePath || !fs.existsSync(u.audioFilePath)) continue;

    const audioDur = await getAudioDuration(u.audioFilePath);
    const span = (u.end - u.start) / 1000;

    // Speedup logic: default 1.2x (matches TTS base rate), max 1.6x
    const speedup = Math.max(1.2, Math.min(audioDur / span, 1.6));
    const newDur = audioDur / speedup;

    const startMs = Math.round(u.start);

    inputArgs.push('-i', u.audioFilePath);
    const inputIdx = inputArgs.length / 2 - 1;

    let chain = `[${inputIdx}:a]asetpts=PTS-STARTPTS`;
    if (speedup !== 1.0) {
      chain += `,atempo=${speedup.toFixed(4)}`;
    }
    chain += `,adelay=${startMs}|${startMs}[a${i}];`;

    filterLines.push(chain);
    amixInputs.push(`[a${i}]`);

    updatedUtterances.push({
      ...u,
      newStartSec: u.start / 1000,
      newEndSec: (u.start / 1000) + newDur
    });
  }

  const successCount = utterances.filter(u => u.audioFilePath && fs.existsSync(u.audioFilePath)).length;
  console.log(`[mixAudioOnly] ${successCount}/${utterances.length} TTS clips ready for mixing.`);

  if (inputArgs.length === 0) {
    console.warn('[mixAudioOnly] WARNING: No valid audio clips found! Returning 1-second silence. Check if Edge TTS is failing for all utterances.');
    // Pure silence if no utterances
    await runFfmpeg([
      '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '1', '-y', finalAudioPath
    ]);
    return { finalAudioPath, completeVideoSegments: [], updatedUtterances };
  }

  // amix mixes all padded inputs. dropout_transition=1000 prevents volume drops when inputs end. normalize=0 disables automatic volume downscaling
  const filterComplex = filterLines.join('') + amixInputs.join('') + `amix=inputs=${amixInputs.length}:dropout_transition=1000:normalize=0[aout]`;

  await runFfmpeg([
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '[aout]',
    '-ar', '44100', '-ac', '2',
    '-y', finalAudioPath
  ]);

  return { finalAudioPath, completeVideoSegments: [], updatedUtterances };
};

module.exports = { mixAudioOnly };

// ──────────────────────────────────────────────────────────────────────────────
// mixAudioForRecap: AI Recap Mode audio mixer
//   • NO audio speedup — TTS audio plays at its natural 1.2x speed
//   • Computes NEW video timestamps for each utterance:
//       gap before utterance  → kept at original duration (original video speed)
//       utterance segment     → lasts exactly TTS duration (video will be stretched)
//   • Mixes TTS clips at the NEW timestamps so audio + video stay in sync
//   • Returns { finalAudioPath, utterancesForVideo, totalVideoDuration }
// ──────────────────────────────────────────────────────────────────────────────
const mixAudioForRecap = async (utterances, outputDir, originalVideoDuration) => {
  const finalAudioPath = path.join(outputDir, `recap_audio_${Date.now()}.mp3`);

  // Sort by original start time
  const sorted = [...utterances].sort((a, b) => a.start - b.start);

  // Measure actual TTS duration for each utterance
  const withDurations = [];
  for (const u of sorted) {
    let ttsDuration = (u.end - u.start) / 1000; // fallback: original duration
    if (u.audioFilePath && fs.existsSync(u.audioFilePath)) {
      try {
        ttsDuration = await getAudioDuration(u.audioFilePath);
      } catch (e) {
        console.warn('[Recap] Could not measure duration:', u.audioFilePath, e.message);
      }
    }
    withDurations.push({ ...u, ttsDuration });
  }

  // Compute new video timestamps (cumulative)
  let videoPos = 0;
  let lastOrigEndSec = 0;
  const utterancesForVideo = [];

  for (const u of withDurations) {
    const origStartSec = u.start / 1000;
    const origEndSec   = u.end   / 1000;
    const gapDur       = origStartSec - lastOrigEndSec;

    if (gapDur > 0.01) videoPos += gapDur; // gap at original speed

    const newVideoStart = videoPos;
    videoPos += u.ttsDuration;

    utterancesForVideo.push({
      origStart:     u.start,        // ms
      origEnd:       u.end,          // ms
      ttsDuration:   u.ttsDuration,  // seconds
      newVideoStart,                 // seconds in final video
      newVideoEnd:   videoPos,       // seconds in final video
      audioFilePath: u.audioFilePath,
    });

    lastOrigEndSec = origEndSec;
  }

  // Trailing gap (tail of original video after last utterance)
  const origTotalSec = (originalVideoDuration || lastOrigEndSec);
  if (origTotalSec > lastOrigEndSec + 0.01) {
    videoPos += origTotalSec - lastOrigEndSec;
  }
  const totalVideoDuration = videoPos;

  // Mix audio at NEW timestamps
  let inputArgs  = [];
  let filterLines = [];
  let amixInputs  = [];
  let mixIdx      = 0;

  for (const u of utterancesForVideo) {
    if (!u.audioFilePath || !fs.existsSync(u.audioFilePath)) continue;
    const startMs = Math.round(u.newVideoStart * 1000);
    inputArgs.push('-i', u.audioFilePath);
    filterLines.push(`[${mixIdx}:a]asetpts=PTS-STARTPTS,adelay=${startMs}|${startMs}[ra${mixIdx}];`);
    amixInputs.push(`[ra${mixIdx}]`);
    mixIdx++;
  }

  const successCount = mixIdx;
  console.log(`[mixAudioForRecap] ${successCount}/${utterancesForVideo.length} clips will be mixed.`);

  if (inputArgs.length === 0) {
    console.warn('[mixAudioForRecap] No valid clips — returning silence.');
    await runFfmpeg(['-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t','1','-y',finalAudioPath]);
  } else {
    const filterComplex =
      filterLines.join('') +
      amixInputs.join('') +
      `amix=inputs=${amixInputs.length}:dropout_transition=1000:normalize=0[raout]`;
    await runFfmpeg([
      ...inputArgs,
      '-filter_complex', filterComplex,
      '-map', '[raout]',
      '-ar', '44100', '-ac', '2',
      '-y', finalAudioPath
    ]);
  }

  // Strip internal audioFilePath before returning to client
  const clientUtterances = utterancesForVideo.map(({ audioFilePath: _fp, ...rest }) => rest);
  return { finalAudioPath, utterancesForVideo: clientUtterances, totalVideoDuration };
};

module.exports = { mixAudioOnly, mixAudioForRecap };
