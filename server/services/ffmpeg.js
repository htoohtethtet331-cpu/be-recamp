const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const path = require('path');
const fs = require('fs');
const getAudioDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
};

const mixAudioOnly = async (utterances, outputDir) => {
  const finalAudioPath = path.join(outputDir, `final_audio_${Date.now()}.mp3`);
  
  // 1. Calculate Timelines
  const MAX_AUDIO_SPEED = 1.3;
  let currentShift = 0;
  const videoSegments = [];
  const updatedUtterances = [];

  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i];
    if (!u.audioFilePath || !fs.existsSync(u.audioFilePath)) {
      continue;
    }
    
    const audioDurSec = await getAudioDuration(u.audioFilePath);
    const originalDurSec = (u.end - u.start) / 1000;
    
    let audioSpeed = 1.0;
    let videoSpeed = 1.0;
    let newAudioDurSec = audioDurSec;
    let newVideoDurSec = originalDurSec;

    if (audioDurSec > originalDurSec) {
      if (audioDurSec / MAX_AUDIO_SPEED <= originalDurSec) {
        audioSpeed = audioDurSec / originalDurSec;
        newAudioDurSec = originalDurSec;
      } else {
        audioSpeed = MAX_AUDIO_SPEED;
        newAudioDurSec = audioDurSec / MAX_AUDIO_SPEED;
        newVideoDurSec = newAudioDurSec;
        videoSpeed = originalDurSec / newVideoDurSec;
      }
    }

    const newStart = (u.start / 1000) + currentShift;
    const newEnd = newStart + newVideoDurSec;
    
    videoSegments.push({
      originalStart: u.start / 1000,
      originalEnd: u.end / 1000,
      newStart: newStart,
      newEnd: newEnd,
      videoSpeed: videoSpeed
    });

    updatedUtterances.push({
      ...u,
      newStartMs: Math.round(newStart * 1000),
      newEndMs: Math.round(newEnd * 1000),
      audioSpeed: audioSpeed
    });

    currentShift += (newVideoDurSec - originalDurSec);
  }

  const completeVideoSegments = [];
  let lastOriginalEnd = 0;
  
  videoSegments.forEach(seg => {
    if (seg.originalStart > lastOriginalEnd) {
      completeVideoSegments.push({
        originalStart: lastOriginalEnd,
        originalEnd: seg.originalStart,
        videoSpeed: 1.0
      });
    }
    completeVideoSegments.push(seg);
    lastOriginalEnd = seg.originalEnd;
  });

  // 2. Mix Audio
  await new Promise((resolve, reject) => {
    let command = ffmpeg();
    let filterComplex = '';
    let mixInputs = '';

    updatedUtterances.forEach((u, index) => {
      command = command.input(u.audioFilePath);
      filterComplex += `[${index}:a]atempo=${u.audioSpeed.toFixed(2)},adelay=${u.newStartMs}|${u.newStartMs}[a${index}];`;
      mixInputs += `[a${index}]`;
    });

    if (updatedUtterances.length === 0) {
      return reject(new Error("No audio files to mix"));
    }

    filterComplex += `${mixInputs}amix=inputs=${updatedUtterances.length}:duration=longest:normalize=0[aout]`;

    command
      .complexFilter(filterComplex)
      .map('[aout]')
      .output(finalAudioPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });

  return { finalAudioPath, completeVideoSegments, updatedUtterances };
};

module.exports = { mixAudioOnly };
