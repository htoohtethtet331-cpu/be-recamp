const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

// Configure fluent-ffmpeg to use the static binaries
ffmpeg.setFfmpegPath(ffmpegStatic);

// Helper to get audio duration using ffprobe
const getAudioDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration); // duration in seconds
    });
  });
};

/**
 * Mix generated audio snippets at specific timestamps into a single MP3 file,
 * preventing overlaps by dynamically speeding up audio that is too long.
 * 
 * @param {Array} utterances - Array of objects {start, end, audioFilePath}
 * @param {string} outputDir - Directory to save final audio
 * @returns {Promise<string>} - Path to the final MP3 file
 */
const mixAudioOnly = async (utterances, outputDir) => {
  const finalAudioPath = path.join(outputDir, `final_audio_${Date.now()}.mp3`);

  const validUtterances = utterances.filter(u => u.audioFilePath && fs.existsSync(u.audioFilePath));
  if (validUtterances.length === 0) {
    throw new Error('No valid audio clips to merge.');
  }

  // 1. Calculate durations and required speedups to prevent overlaps
  for (let i = 0; i < validUtterances.length; i++) {
    const u = validUtterances[i];
    try {
      u.actualDuration = await getAudioDuration(u.audioFilePath);

      // Calculate max allowed duration before the NEXT utterance starts
      if (i < validUtterances.length - 1) {
        const nextStartMs = validUtterances[i + 1].start;
        // Max duration is the time gap minus a small buffer (0.1s) for safety
        u.maxDuration = (nextStartMs - u.start) / 1000 - 0.1;
        if (u.maxDuration < 0.5) u.maxDuration = 0.5; // absolute minimum limit
      } else {
        u.maxDuration = u.actualDuration; // No strict limit for the last audio
      }

      // Calculate speed ratio if the actual audio exceeds the allowed time window
      if (u.actualDuration > u.maxDuration) {
        u.speedRatio = u.actualDuration / u.maxDuration;

        // Cap the speed ratio at 4.0x to avoid failing FFmpeg, but high enough to guarantee it fits tight gaps
        if (u.speedRatio > 4.0) {
          u.speedRatio = 3.0;
        }
      } else {
        u.speedRatio = 1.0;
      }
    } catch (err) {
      console.warn('Could not probe audio duration for', u.audioFilePath, err.message);
      u.speedRatio = 1.0;
    }
  }

  // 2. Build the FFmpeg command
  return new Promise((resolve, reject) => {
    let command = ffmpeg();
    let filterComplex = '';
    let inputs = '';

    validUtterances.forEach((u, index) => {
      command = command.input(u.audioFilePath);
      const delayMs = u.start;

      // If speedup is needed, apply atempo filter before adelay
      if (u.speedRatio > 1.0) {
        // atempo accepts values between 0.5 and 100.0
        filterComplex += `[${index}:a]atempo=${u.speedRatio.toFixed(2)},adelay=${delayMs}|${delayMs}[a${index}];`;
      } else {
        filterComplex += `[${index}:a]adelay=${delayMs}|${delayMs}[a${index}];`;
      }
      inputs += `[a${index}]`;
    });

    // Mix all processed inputs together
    if (validUtterances.length === 1) {
      filterComplex += `[a0]anull[aout]`;
    } else {
      filterComplex += `${inputs}amix=inputs=${validUtterances.length}:duration=longest:normalize=0[aout]`;
    }

    command
      .complexFilter(filterComplex)
      .outputOptions([
        '-map [aout]',
        '-c:a libmp3lame', // Encode as MP3
        '-b:a 128k' // Bitrate
      ])
      .save(finalAudioPath)
      .on('start', (cmd) => {
        console.log('Started FFmpeg audio mixing with command:', cmd);
      })
      .on('end', () => {
        console.log('Audio muxing finished successfully');
        resolve(finalAudioPath);
      })
      .on('error', (err) => {
        console.error('Error during ffmpeg audio muxing:', err);
        reject(err);
      });
  });
};

module.exports = { mixAudioOnly };
