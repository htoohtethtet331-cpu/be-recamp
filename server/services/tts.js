const { Communicate } = require('edge-tts-universal');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);
const ffmpegPath = require('ffmpeg-static');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Generate raw audio buffer from edge-tts with retry
async function synth(text, opts, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const c = new Communicate(text, opts);
      const audio = [];
      for await (const ch of c.stream()) {
        if (ch.type === 'audio' && ch.data) {
          audio.push(Buffer.from(ch.data));
        }
      }
      return Buffer.concat(audio);
    } catch (e) {
      console.error(`Edge TTS try ${i} failed:`, e.message);
      if (i === tries) throw e;
      await sleep(1000 * i);
    }
  }
}

// Trim leading AND trailing silence using reverse/trim/reverse trick
// CLAUDE.md: "Trim leading/trailing silence from every clip"
// CLAUDE.md bug note: "ffmpeg stop_periods triggers on first internal pause - use reverse trick instead"
async function trimSilence(inputPath, outputPath) {
  await new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
      '-y',
      '-i', inputPath,
      // Trim leading silence
      '-af', [
        'silenceremove=start_periods=1:start_threshold=-50dB',
        // Reverse, trim leading (= was trailing) silence, reverse back
        'areverse',
        'silenceremove=start_periods=1:start_threshold=-50dB',
        'areverse'
      ].join(','),
      outputPath
    ], (err, _stdout, stderr) => {
      if (err) {
        console.error('[trimSilence error]', stderr);
        return reject(new Error(stderr || err.message));
      }
      resolve();
    });
  });
}

// Generate TTS clips for each translated utterance
// CLAUDE.md Step 6: "edge-tts, Burmese voice, fixed rate=+30%, one clip per block. Trim silence."
const generateTTSForUtterances = async (utterances, outputDir, voiceOptions = {}) => {
  const processedUtterances = [...utterances];
  // Process in parallel batches — each TTS call has its own WebSocket, safe to parallelize
  // CLAUDE.md: "one clip per block"
  const BATCH_SIZE = 8;  // was 5 — bumped for speed; edge-tts handles concurrent connections

  // Default base rate is +20% (1.2x). Voice preset rate offsets are applied on top.
  const baseRate = 20; // percent — 1.2x speed
  const presetRate = parseInt((voiceOptions.rate || '+0%').replace('%', '')) || 0;
  const finalRate = baseRate + presetRate;
  const rateStr = `${finalRate >= 0 ? '+' : ''}${finalRate}%`;

  const synthOpts = {
    voice: typeof voiceOptions === 'string'
      ? voiceOptions
      : (voiceOptions.voice || 'my-MM-NilarNeural'),
    rate: rateStr,   // 1.2x base + voice preset offset
    pitch: voiceOptions.pitch || '+0Hz',
    volume: '+0%',
  };

  for (let i = 0; i < processedUtterances.length; i += BATCH_SIZE) {
    const batch = processedUtterances.slice(i, i + BATCH_SIZE);
    console.log(`[TTS] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(processedUtterances.length / BATCH_SIZE)}`);

    // Run all clips in this batch IN PARALLEL — big speedup
    // Each Communicate() opens its own WebSocket so concurrent calls are safe
    await Promise.allSettled(batch.map(async (u, b) => {
      const originalIndex = i + b;
      if (!u.translatedText) return;

      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 7);
      const tempPath = path.join(outputDir, `raw_tts_${ts}_${originalIndex}_${rand}.mp3`);
      const trimmedPath = path.join(outputDir, `tts_${ts}_${originalIndex}_${rand}.mp3`);

      try {
        const audioBuffer = await synth(u.translatedText, synthOpts);
        fs.writeFileSync(tempPath, audioBuffer);

        // Trim leading & trailing silence (CLAUDE.md: reverse→trim→reverse trick)
        await trimSilence(tempPath, trimmedPath);
        fs.unlinkSync(tempPath);

        processedUtterances[originalIndex].audioFilePath = trimmedPath;
      } catch (err) {
        console.error(`[TTS] Failed utterance ${originalIndex}:`, err.message);
        // Leave audioFilePath undefined; ffmpeg.js will use silence for this block
      }
    }));

    // Brief pause between batches — gives edge-tts servers a moment to breathe
    if (i + BATCH_SIZE < processedUtterances.length) {
      await sleep(200); // was 500ms
    }
  }

  return processedUtterances;
};

module.exports = { generateTTSForUtterances, synth };
