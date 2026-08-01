require('dotenv').config({ path: '/Users/user/Project Recamp/server/.env' });
const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function run() {
  const apiKey = process.env.GROQ_API_KEY;
  const groq = new Groq({ apiKey });
  
  // Generate a silent audio + speech
  // "say" command works on macOS to generate speech
  const testAudio = path.join(__dirname, 'test_audio.wav');
  execSync(`say "Hello world" -o ${testAudio} --data-format=LEF32@22050`);
  
  try {
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(testAudio),
      model: 'whisper-large-v3',
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment']
    });
    console.log("Success! Words available:", !!transcription.words);
    if (transcription.words && transcription.words.length > 0) {
      console.log("First word start time:", transcription.words[0].start);
    }
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    if (fs.existsSync(testAudio)) fs.unlinkSync(testAudio);
  }
}
run();
