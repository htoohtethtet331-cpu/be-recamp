const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const { v2: cloudinary } = require('cloudinary');
const fs = require('fs');
const path = require('path');

const { getTranscriptAndTimestamps } = require('./services/assemblyai');
const { translateUtterances } = require('./services/gemini');
const { generateTTSForUtterances, synth } = require('./services/tts');
const { mixAudioOnly, renderVideo } = require('./services/ffmpeg');
const connectDB = require('./config/db');
const Settings = require('./models/Settings');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const { requireAuth, requireAdmin, JWT_SECRET } = require('./middleware/auth');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Initialize database
connectDB().then(() => {
  console.log('Database synced');
}).catch((err) => {
  console.error('Failed to sync database:', err);
});


dotenv.config();

const app = express();
app.set('trust proxy', 1); // Trust Render's proxy to get correct https protocol
const port = process.env.PORT || 5000;

// CORS: Allow Netlify frontend + local dev
const allowedOrigins = [
  /\.netlify\.app$/,
  /\.netlify\.com$/,
  'https://deeplearnaixrecapstudio.app',
  'https://www.deeplearnaixrecapstudio.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://118.27.151.80',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    if (allowed) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit for audio files to prevent DoS
});

// Large video upload multer for premium/admin server rendering (1.5GB limit)
const videoUpload = multer({
  storage: storage,
  limits: { fileSize: 1.5 * 1024 * 1024 * 1024 } // 1.5GB
});

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

app.get('/api', (req, res) => {
  res.send('Recap Studio API is running');
});


// --- Auth Endpoints ---
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'No credential provided' });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { name, email, picture } = payload;

    // Check if user exists
    let user = await User.findOne({ email });
    if (!user) {
      // Set tiktokjaxon709@gmail.com as hardcoded admin, others default to free
      const role = email === 'tiktokjaxon709@gmail.com' ? 'admin' : 'free';
      user = await User.create({ name, email, picture, role });
    } else {
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name, picture: user.picture, videoLimit: user.videoLimit, freeVideosUsed: user.freeVideosUsed, lastFreeVideoDate: user.lastFreeVideoDate },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(401).json({ error: 'Invalid Google Token' });
  }
});

// Get current user profile (to refresh role)
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // No auto-downgrade here to prevent breaking mid-video state
    
    // Create a fresh token in case role changed
    const freshToken = jwt.sign(
      { id: user._id, role: user.role, name: user.name, picture: user.picture, videoLimit: user.videoLimit, freeVideosUsed: user.freeVideosUsed, lastFreeVideoDate: user.lastFreeVideoDate },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ token: freshToken, user: { id: user._id, role: user.role, name: user.name, picture: user.picture, videoLimit: user.videoLimit, freeVideosUsed: user.freeVideosUsed, lastFreeVideoDate: user.lastFreeVideoDate } });
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching user' });
  }
});

// --- Admin Endpoints ---

// Get API Keys
app.get('/api/admin/keys', requireAdmin, async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update API Keys & Packages
app.post('/api/admin/keys', requireAdmin, async (req, res) => {
  try {
    const { geminiKey, groqKey, groqKeys, assemblyAiKey, packages } = req.body;
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ geminiKey, groqKey, groqKeys, assemblyAiKey, packages });
    } else {
      if (geminiKey !== undefined) settings.geminiKey = geminiKey;
      if (groqKey !== undefined) settings.groqKey = groqKey;
      if (groqKeys !== undefined) settings.groqKeys = groqKeys;
      if (assemblyAiKey !== undefined) settings.assemblyAiKey = assemblyAiKey;
      if (packages !== undefined) settings.packages = packages;
      await settings.save();
    }
    res.json(settings);
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get Public Settings (e.g. Packages)
app.get('/api/settings/public', async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json({ packages: settings.packages });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch public settings' });
  }
});


// Get all users (Admin only)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update user role (Admin only)
app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['free', 'premium', 'admin', 'restrict'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Update user video limit (Admin only)
app.put('/api/admin/users/:id/limit', requireAdmin, async (req, res) => {
  try {
    const { videoLimit } = req.body;
    if (typeof videoLimit !== 'number' || videoLimit < 0) {
      return res.status(400).json({ error: 'Invalid video limit' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { videoLimit }, { new: true });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user limit' });
  }
});

// --- Main App Endpoints ---

// Step 1: Extract Audio, Transcribe, and store original video on server
// Accepts multipart: audio=<mp3>, video=<original_video>, assemblyAiKey=<key>
app.post('/api/step1-extract', requireAuth, videoUpload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'video', maxCount: 1 }
]), async (req, res) => {
  let videoPath = null;
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const today = new Date().toISOString().split('T')[0];
    
    if (user.role === 'restrict') {
      return res.status(403).json({ error: 'သင့်အကောင့်ကို ပိတ်ပင်ထားပါသည်။ (Your account has been restricted.)' });
    }
    
    if (user.role === 'free') {
      if (!user.lastFreeVideoDate || user.lastFreeVideoDate.toISOString().split('T')[0] !== today) {
        user.freeVideosUsed = 0;
        user.lastFreeVideoDate = new Date();
      }
      if (user.freeVideosUsed >= 3) {
        return res.status(403).json({ error: 'Daily video limit reached. You can only generate 3 videos per day on the Free plan.' });
      }
    } else if (user.role === 'premium') {
      if (user.videoLimit <= 0) {
        user.role = 'free';
        user.videoLimit = 0;
        await user.save();
        return res.status(403).json({ error: 'Video limit reached. You have been downgraded to the Free plan.' });
      }
    }

    const audioFile = req.files?.audio?.[0];
    const videoFile = req.files?.video?.[0];
    
    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    if (!videoFile) {
      return res.status(400).json({ error: 'No video file provided' });
    }
    
    videoPath = videoFile.path;
    
    console.log(`[Step 1] Audio: ${audioFile.originalname}, Video: ${videoFile.originalname}. Transcribing...`);
    
    let assemblyAiKey = req.body.assemblyAiKey;
    
    if (!assemblyAiKey) {
      return res.status(403).json({ error: 'Everyone must provide their own AssemblyAI API key.' });
    }
    
    const settings = await Settings.findOne();
    if (settings && settings.groqKey) {
      process.env.GROQ_API_KEY = settings.groqKey;
    }

    const utterances = await getTranscriptAndTimestamps(audioFile.path, assemblyAiKey, user.role === 'free');

    // Cleanup audio file (not needed anymore)
    if (audioFile.path && fs.existsSync(audioFile.path)) {
      try { fs.unlinkSync(audioFile.path); } catch (_) {}
    }

    // Update limits on success
    let remainingLimit = 0;
    if (user.role === 'free') {
      user.freeVideosUsed += 1;
      user.lastFreeVideoDate = new Date();
      remainingLimit = Math.max(0, 3 - user.freeVideosUsed);
      await user.save();
    } else if (user.role === 'premium') {
      user.videoLimit -= 1;
      remainingLimit = user.videoLimit;
      await user.save();
    } else {
      remainingLimit = Infinity;
    }

    // Return videoStorageKey so Step 4 can mux without re-upload
    const videoStorageKey = videoFile.filename;
    
    console.log(`[Step 1] Complete. Found ${utterances.length} utterances. VideoKey: ${videoStorageKey}`);
    res.json({ 
      utterances,
      videoId: videoStorageKey,
      videoStorageKey,
      remainingLimit,
      role: user.role,
      freeVideosUsed: user.freeVideosUsed,
      lastFreeVideoDate: user.lastFreeVideoDate
    });
  } catch (error) {
    // Cleanup video on error
    if (videoPath && fs.existsSync(videoPath)) {
      try { fs.unlinkSync(videoPath); } catch (_) {}
    }
    console.error('Step 1 Error:', error);
    res.status(500).json({ error: 'Extraction & Transcription failed', details: error.message });
  }
});


// Step 2: Translate English text to Burmese
app.post('/api/step2-translate', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'restrict') return res.status(403).json({ error: 'သင့်အကောင့်ကို ပိတ်ပင်ထားပါသည်။ (Your account has been restricted.)' });

    const { utterances } = req.body;
    if (!utterances || !Array.isArray(utterances)) {
      return res.status(400).json({ error: 'Invalid utterances array provided' });
    }
    if (utterances.length > 500) {
      return res.status(400).json({ error: 'Too many utterances. Maximum allowed is 500.' });
    }

    let apiKey = req.body.apiKey;
    
    if (user.role === 'free' && (!apiKey || apiKey.trim() === '')) {
      return res.status(403).json({ error: 'Free users must provide their own API key. Access to Admin API Key is forbidden.' });
    }

    let groqKeys = [];
    if (!apiKey || apiKey.trim() === '') {
      const settings = await Settings.findOne();
      if (settings) {
        apiKey = settings.geminiKey;
        groqKeys = settings.groqKeys || [];
      }
    } else {
      // Even if user provides a gemini key, still fetch groqKeys for translation
      const settings = await Settings.findOne();
      if (settings) {
        groqKeys = settings.groqKeys || [];
      }
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API Key is required (provide in request or save in Admin Dashboard)' });
    }
    
    console.log(`[Step 2] Received ${utterances.length} utterances for translation. Primary Groq Keys: ${groqKeys.filter(k => k).length}, Fallback Gemini Key starting with: ${apiKey.substring(0, 10)}...`);
    const translatedUtterances = await translateUtterances(utterances, apiKey, groqKeys);
    
    console.log(`[Step 2] Translation complete.`);
    res.json({ translatedUtterances });
  } catch (error) {
    console.error('Step 2 Error:', error);
    res.status(500).json({ error: 'Translation failed', details: error.message });
  }
});

// Step 3: Generate TTS and Mix Audio
app.post('/api/step3-tts', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'restrict') return res.status(403).json({ error: 'သင့်အကောင့်ကို ပိတ်ပင်ထားပါသည်။ (Your account has been restricted.)' });

    const { translatedUtterances, voice, videoDuration } = req.body;
    if (!translatedUtterances || !Array.isArray(translatedUtterances)) {
      return res.status(400).json({ error: 'Invalid translatedUtterances array provided' });
    }
    if (translatedUtterances.length > 500) {
      return res.status(400).json({ error: 'Too many utterances. Maximum allowed is 500.' });
    }
    
    console.log(`[Step 3] Generating TTS for ${translatedUtterances.length} utterances with voice ${voice || 'default'}...`);
    const ttsOutputDir = path.join(__dirname, 'uploads');
    
    // Ensure uploads directory exists
    if (!fs.existsSync(ttsOutputDir)) {
      fs.mkdirSync(ttsOutputDir);
    }

    const utterancesWithAudio = await generateTTSForUtterances(translatedUtterances, ttsOutputDir, voice);
    
    console.log(`[Step 3] Mixing audio tracks...`);
    const { finalAudioPath, completeVideoSegments, updatedUtterances: finalUtterances } = await mixAudioOnly(utterancesWithAudio, ttsOutputDir, videoDuration);
    
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
      url: localUrl,
      finalAudioFilename: path.basename(finalAudioPath),
      videoSegments: completeVideoSegments,
      updatedUtterances: finalUtterances
    });
  } catch (error) {
    console.error('Step 3 Error:', error);
    res.status(500).json({ error: 'TTS & Mixing failed', details: error.message });
  }
});

app.post('/api/tts-preview', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'restrict') return res.status(403).json({ error: 'သင့်အကောင့်ကို ပိတ်ပင်ထားပါသည်။ (Your account has been restricted.)' });

    const { voice, text } = req.body;
    
    if (text && text.length > 500) {
      return res.status(400).json({ error: 'Text too long for preview. Maximum 500 characters.' });
    }
    // Sanitize pitch — edge-tts requires format like "+0Hz", "0Hz" is invalid
    let pitch = (typeof voice === 'object' && voice.pitch) ? voice.pitch : '+0Hz';
    if (!pitch.startsWith('+') && !pitch.startsWith('-')) {
      pitch = '+' + pitch;
    }
    if (!pitch.endsWith('Hz')) {
      pitch = pitch + 'Hz';
    }
    const synthOpts = {
      voice: typeof voice === 'string' ? voice : (voice.voice || 'my-MM-NilarNeural'),
      rate: '+30%',   // CLAUDE.md hard rule: always +30%
      pitch: pitch,
      volume: '+0%'
    };
    const audioBuffer = await synth(text || 'မင်္ဂလာပါ။ ဒါကတော့ အသံအစမ်း နားထောင်ကြည့်တာပါ။', synthOpts);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (e) {
    console.error('TTS Preview Error:', e);
    res.status(500).json({ error: String(e.message || e) });
  }
});


// Step 4 (Server Render): Native FFmpeg Muxing
// Uses videoStorageKey from Step 1 — no re-upload needed from client
app.post('/api/step4-render', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'restrict') return res.status(403).json({ error: 'Your account is restricted.' });

    const { audioFilename, videoStorageKey } = req.body;
    if (!audioFilename) return res.status(400).json({ error: 'audioFilename is required' });
    if (!videoStorageKey) return res.status(400).json({ error: 'videoStorageKey is required' });

    const audioPath = path.join(__dirname, 'uploads', audioFilename);
    const videoPath = path.join(__dirname, 'uploads', videoStorageKey);

    if (!fs.existsSync(audioPath)) {
      return res.status(404).json({ error: 'Audio file not found on server. Please re-process Step 3.' });
    }
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video file not found on server. Please re-upload your video.' });
    }

    console.log(`[Step 4] User: ${user.email}, VideoKey: ${videoStorageKey}, AudioFile: ${audioFilename}`);

    const outputDir = path.join(__dirname, 'uploads');
    const outputPath = await renderVideo(videoPath, audioPath, [], 0, outputDir);

    const baseUrl = req.protocol + '://' + req.get('host');
    const outputUrl = `${baseUrl}/uploads/${path.basename(outputPath)}`;

    console.log(`[Step 4] Done! Output: ${outputUrl}`);
    
    // Cleanup source video (keep audio and output for download)
    if (fs.existsSync(videoPath)) {
      try { fs.unlinkSync(videoPath); } catch (_) {}
    }

    res.json({ url: outputUrl, filename: path.basename(outputPath) });
  } catch (error) {
    console.error('[Step 4] Error:', error);
    res.status(500).json({ error: 'Server rendering failed', details: error.message });
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

const os = require('os');
const getLocalIP = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

const server = app.listen(port, () => {
  const localIP = getLocalIP();
  console.log(`✅ Server running!`);
  console.log(`   Local:   http://localhost:${port}`);
  console.log(`   Network: http://${localIP}:${port}`);
});

// Disable timeouts to prevent 408 errors during large uploads
server.requestTimeout = 0;
server.headersTimeout = 0;
server.keepAliveTimeout = 65000;
server.setTimeout(0);


