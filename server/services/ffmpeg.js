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

    // Speedup logic: default 1.3x, max 1.6x
    const speedup = Math.max(1.3, Math.min(audioDur / span, 1.6));
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

  if (inputArgs.length === 0) {
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


// ── Server-Side Video Renderer ──────────────────────────────────────────────────
// Premium/Admin only. Takes the original video path, the final mixed audio path,
// and the videoSegments array from Step 3 to produce the final retimed video.
const renderVideo = async (videoPath, audioPath, videoSegments, videoDuration, outputDir) => {
  const outputPath = path.join(outputDir, `render_${Date.now()}.mp4`);

  // Simple mux: keep original video, drop original audio, add new audio track. No re-encoding video.
  await runFfmpeg([
    '-i', videoPath,
    '-i', audioPath,
    '-c:v', 'copy',
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-y', outputPath
  ]);

  return outputPath;
};

module.exports = { mixAudioOnly, renderVideo };
