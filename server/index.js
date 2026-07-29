const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const { v2: cloudinary } = require('cloudinary');
const fs = require('fs');
const path = require('path');

const { getTranscriptAndTimestamps } = require('./services/assemblyai');
const { translateUtterances } = require('./services/gemini');
const { generateTTSForUtterances } = require('./services/tts');
const { mixAudioOnly } = require('./services/ffmpeg');

dotenv.config();

const app = express();
app.set('trust proxy', 1); // Trust Render's proxy to get correct https protocol
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Set up temporary storage for multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

app.get('/', (req, res) => {
  res.send('Recap Studio API is running');
});

// Step 1: Extract Audio and Transcribe
app.post('/api/step1-extract', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    console.log(`[Step 1] File received: ${req.file.originalname}. Transcribing via Groq...`);
    
    // We already have the audio extracted by the client!
    const assemblyAiKey = req.body.assemblyAiKey;
    const utterances = await getTranscriptAndTimestamps(req.file.path, assemblyAiKey);

    const videoId = req.file.filename; // Keeping as ID for reference
    
    console.log(`[Step 1] Complete. Found ${utterances.length} utterances. Video ID: ${videoId}`);
    res.json({ 
      utterances,
      videoId
    });
  } catch (error) {
    console.error('Step 1 Error:', error);
    res.status(500).json({ error: 'Extraction & Transcription failed', details: error.message });
  }
});

// Step 2: Translate English text to Burmese
app.post('/api/step2-translate', async (req, res) => {
  try {
    const { utterances } = req.body;
    if (!utterances || !Array.isArray(utterances)) {
      return res.status(400).json({ error: 'Invalid utterances array provided' });
    }
    
    console.log(`[Step 2] Received ${utterances.length} utterances for translation.`);
    const translatedUtterances = await translateUtterances(utterances);
    
    console.log(`[Step 2] Translation complete.`);
    res.json({ translatedUtterances });
  } catch (error) {
    console.error('Step 2 Error:', error);
    res.status(500).json({ error: 'Translation failed', details: error.message });
  }
});

// Step 3: Generate TTS and Mix Audio
app.post('/api/step3-tts', async (req, res) => {
  try {
    const { translatedUtterances, voice } = req.body;
    if (!translatedUtterances || !Array.isArray(translatedUtterances)) {
      return res.status(400).json({ error: 'Invalid translatedUtterances array provided' });
    }
    
    console.log(`[Step 3] Generating TTS for ${translatedUtterances.length} utterances with voice ${voice || 'default'}...`);
    const ttsOutputDir = path.join(__dirname, 'uploads');
    
    // Ensure uploads directory exists
    if (!fs.existsSync(ttsOutputDir)) {
      fs.mkdirSync(ttsOutputDir);
    }

    const utterancesWithAudio = await generateTTSForUtterances(translatedUtterances, ttsOutputDir, voice);
    
    console.log(`[Step 3] Mixing audio tracks...`);
    const finalAudioPath = await mixAudioOnly(utterancesWithAudio, ttsOutputDir);
    
    console.log(`[Step 3] Skipping Cloudinary upload, using local URL to speed up...`);
    const baseUrl = req.protocol + '://' + req.get('host');
    const localUrl = `${baseUrl}/uploads/${path.basename(finalAudioPath)}`;
    
    // Cleanup temporary files EXCEPT the final mixed audio which we need for the frontend
    utterancesWithAudio.forEach(u => { 
      if (u.audioFilePath && fs.existsSync(u.audioFilePath)) {
        fs.unlinkSync(u.audioFilePath);
      }
    });
    
    console.log(`[Step 3] Process finished successfully.`);
    res.json({ 
      message: 'Processing complete', 
      url: localUrl
    });
  } catch (error) {
    console.error('Step 3 Error:', error);
    res.status(500).json({ error: 'TTS & Mixing failed', details: error.message });
  }
});

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  // Set static folder
  app.use(express.static(path.join(__dirname, '../client/dist')));

  app.get(/(.*)/, (req, res) => {
    res.sendFile(path.resolve(__dirname, '../client', 'dist', 'index.html'));
  });
}

const server = app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

// Disable timeouts to prevent 408 errors during large uploads
server.requestTimeout = 0;
server.headersTimeout = 0;
server.keepAliveTimeout = 0;
server.setTimeout(0);


