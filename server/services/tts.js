const { Communicate } = require('edge-tts-universal');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Generate audio buffer using edge-tts-universal with retry logic
 */
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

/**
 * Generate audio files for each translated utterance using Edge TTS
 * @param {Array} utterances - Array of objects {start, end, translatedText}
 * @param {string} outputDir - Directory to save temporary audio clips
 * @returns {Promise<Array>} - Array with audioFilePath added
 */
const generateTTSForUtterances = async (utterances, outputDir, voiceName = 'my-MM-NilarNeural') => {
  try {
    const processedUtterances = [...utterances];
    
    // Process in batches of 5 to avoid Edge TTS websocket drops/hangs
    const BATCH_SIZE = 5;
    
    for (let i = 0; i < processedUtterances.length; i += BATCH_SIZE) {
      const batch = processedUtterances.slice(i, i + BATCH_SIZE);
      console.log(`Processing TTS batch ${i/BATCH_SIZE + 1} of ${Math.ceil(processedUtterances.length / BATCH_SIZE)}...`);
      
      await Promise.all(batch.map(async (u, batchIndex) => {
        if (!u.translatedText) return;
        
        const originalIndex = i + batchIndex;
        const fileName = `tts_${Date.now()}_${originalIndex}.mp3`; 
        const filePath = path.join(outputDir, fileName);
        
        try {
          const audioBuffer = await synth(u.translatedText, {
            voice: voiceName, 
            rate: '+0%',
            pitch: '+0Hz',
            volume: '+0%'
          });
          
          fs.writeFileSync(filePath, audioBuffer);
          processedUtterances[originalIndex].audioFilePath = filePath;
        } catch (err) {
          console.error(`Failed to generate TTS for utterance ${originalIndex}:`, err);
        }
      }));
      
      // Sleep for 500ms between batches to prevent rate limiting
      if (i + BATCH_SIZE < processedUtterances.length) {
        await sleep(500);
      }
    }

    return processedUtterances;
  } catch (error) {
    console.error('Error generating Edge TTS:', error);
    throw error;
  }
};

module.exports = { generateTTSForUtterances };
