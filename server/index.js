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
const { mixAudioOnly, mixAudioForRecap } = require('./services/ffmpeg');
const connectDB = require('./config/db');
const Settings = require('./models/Settings');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Payment = require('./models/Payment');
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
      { id: user._id, role: user.role, name: user.name, email: user.email, picture: user.picture, videoLimit: user.videoLimit, freeVideosUsed: user.freeVideosUsed, lastFreeVideoDate: user.lastFreeVideoDate },
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
      { id: user._id, role: user.role, name: user.name, email: user.email, picture: user.picture, videoLimit: user.videoLimit, freeVideosUsed: user.freeVideosUsed, lastFreeVideoDate: user.lastFreeVideoDate },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ token: freshToken, user: { id: user._id, role: user.role, name: user.name, email: user.email, picture: user.picture, videoLimit: user.videoLimit, freeVideosUsed: user.freeVideosUsed, lastFreeVideoDate: user.lastFreeVideoDate } });
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
    const { geminiKey, groqKey, groqKeys, assemblyAiKey, packages, kpayQr, waveQr, promptpayQr } = req.body;
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ geminiKey, groqKey, groqKeys, assemblyAiKey, packages, kpayQr, waveQr, promptpayQr });
    } else {
      if (geminiKey !== undefined) settings.geminiKey = geminiKey;
      if (groqKey !== undefined) settings.groqKey = groqKey;
      if (groqKeys !== undefined) settings.groqKeys = groqKeys;
      if (assemblyAiKey !== undefined) settings.assemblyAiKey = assemblyAiKey;
      if (packages !== undefined) settings.packages = packages;
      if (kpayQr !== undefined) settings.kpayQr = kpayQr;
      if (waveQr !== undefined) settings.waveQr = waveQr;
      if (promptpayQr !== undefined) settings.promptpayQr = promptpayQr;
      await settings.save();
    }
    res.json(settings);
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get Public Settings (e.g. Packages & QRs)
app.get('/api/settings/public', async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json({ 
      packages: settings.packages,
      kpayQr: settings.kpayQr,
      waveQr: settings.waveQr,
      promptpayQr: settings.promptpayQr 
    });
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

// --- Payment Endpoints ---

// Submit a new payment request
app.post('/api/payment/submit', requireAuth, upload.single('receipt'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { phone, packageTitle, packageMmk, packageVideos, paymentMethod } = req.body;
    const file = req.file;

    if (!phone || !packageTitle || !packageMmk || !packageVideos || !paymentMethod) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!file) {
      return res.status(400).json({ error: 'Payment receipt image is required' });
    }

    // Save payment request to database
    const payment = new Payment({
      userId: user._id,
      name: user.name,
      email: user.email,
      phone,
      packageTitle,
      packageMmk: Number(packageMmk),
      packageVideos: Number(packageVideos),
      paymentMethod,
      receiptUrl: `/uploads/${file.filename}`,
      status: 'pending'
    });

    await payment.save();
    console.log(`[Payment] New request from ${user.name} (${user.email}) for ${packageTitle}`);
    
    res.status(201).json({ success: true, message: 'Payment submitted successfully', payment });
  } catch (error) {
    console.error('Payment submit error:', error);
    res.status(500).json({ error: 'Failed to submit payment' });
  }
});

// --- Main App Endpoints ---


// Step 1: Extract Audio and Transcribe (audio only)
app.post('/api/step1-extract', requireAuth, upload.single('audio'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
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
        user.role = 'free'; user.videoLimit = 0; await user.save();
        return res.status(403).json({ error: 'Video limit reached. You have been downgraded to the Free plan.' });
      }
    }

    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

    let assemblyAiKey = req.body.assemblyAiKey;
    if (!assemblyAiKey) return res.status(403).json({ error: 'Everyone must provide their own AssemblyAI API key.' });

    const settings = await Settings.findOne();
    if (settings?.groqKey) process.env.GROQ_API_KEY = settings.groqKey;

    console.log(`[Step 1] Transcribing ${req.file.originalname}...`);
    const utterances = await getTranscriptAndTimestamps(req.file.path, assemblyAiKey, user.role === 'free');

    // Cleanup audio (no longer needed)
    if (req.file.path && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }

    // Update limits on success
    let remainingLimit = 0;
    if (user.role === 'free') {
      user.freeVideosUsed += 1; user.lastFreeVideoDate = new Date();
      remainingLimit = Math.max(0, 3 - user.freeVideosUsed);
      await user.save();
    } else if (user.role === 'premium') {
      user.videoLimit -= 1; remainingLimit = user.videoLimit; await user.save();
    } else {
      remainingLimit = Infinity;
    }

    console.log(`[Step 1] Complete. Found ${utterances.length} utterances.`);
    res.json({ utterances, remainingLimit, role: user.role, freeVideosUsed: user.freeVideosUsed, lastFreeVideoDate: user.lastFreeVideoDate });
  } catch (error) {
    console.error('Step 1 Error:', error);
    res.status(500).json({ error: 'Extraction & Transcription failed', details: error.message });
  }
});


// Step 2: Translate English text to Burmese
app.post('/api/step2-translate', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'restrict') return res.status(403).json({ error: 'သင့်အကောင့်ကို ပိတ်ပင်ထားပါသည်။' });

    const { utterances, apiKey: clientApiKey } = req.body;
    if (!utterances || !Array.isArray(utterances)) {
      return res.status(400).json({ error: 'Invalid utterances array provided' });
    }
    if (utterances.length > 500) {
      return res.status(400).json({ error: 'Too many utterances. Maximum allowed is 500.' });
    }

    const settings = await Settings.findOne();
    const adminGeminiKey = settings?.geminiKey;

    let geminiKey;

    if (user.role === 'free') {
      // Free users: MUST provide their own Gemini API key
      if (!clientApiKey || clientApiKey.trim() === '') {
        return res.status(403).json({ 
          error: 'Free users တွေဟာ ကိုယ်ပိုင် Gemini API Key ထည့်မှသာ ဘာသာပြန်နိုင်ပါတယ်။' 
        });
      }
      geminiKey = clientApiKey.trim();
    } else {
      // Premium/Admin: Use client's key if provided, otherwise fall back to admin key
      geminiKey = (clientApiKey && clientApiKey.trim()) ? clientApiKey.trim() : adminGeminiKey;
      if (!geminiKey || geminiKey.trim() === '') {
        return res.status(400).json({ 
          error: 'Admin မှ Gemini API Key သတ်မှတ်မထားသေးပါ။ Admin Dashboard တွင် Gemini Key ထည့်သွင်းပေးပါ။' 
        });
      }
    }

    console.log(`[Step 2] ${user.role} user | ${utterances.length} utterances | key: ${geminiKey.substring(0, 10)}...`);
    const translatedUtterances = await translateUtterances(utterances, geminiKey);

    console.log(`[Step 2] Translation complete.`);
    res.json({ translatedUtterances });
  } catch (error) {
    console.error('Step 2 Error:', error);
    res.status(500).json({ 
      error: 'Translation failed', 
      details: error.message 
    });
  }
});


// Step 3: Generate TTS and Mix Audio (Dubbing Mode OR AI Recap Mode)
app.post('/api/step3-tts', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'restrict') return res.status(403).json({ error: 'သင့်အကောင့်ကို ပိတ်ပင်ထားပါသည်။ (Your account has been restricted.)' });

    const { translatedUtterances, voice, videoDuration, recapMode } = req.body;
    if (!translatedUtterances || !Array.isArray(translatedUtterances)) {
      return res.status(400).json({ error: 'Invalid translatedUtterances array provided' });
    }
    if (translatedUtterances.length > 500) {
      return res.status(400).json({ error: 'Too many utterances. Maximum allowed is 500.' });
    }
    
    const modeLabel = recapMode ? 'AI Recap' : 'Dubbing';
    console.log(`[Step 3 - ${modeLabel}] Generating TTS for ${translatedUtterances.length} utterances...`);
    const ttsOutputDir = path.join(__dirname, 'uploads');
    
    if (!fs.existsSync(ttsOutputDir)) {
      fs.mkdirSync(ttsOutputDir);
    }

    const utterancesWithAudio = await generateTTSForUtterances(translatedUtterances, ttsOutputDir, voice);

    console.log(`[Step 3] Mixing audio tracks (${modeLabel} mode)...`);
    const baseUrl = req.protocol + '://' + req.get('host');

    if (recapMode) {
      // ── AI Recap Mode: no audio speedup, compute new video timestamps ──
      const { finalAudioPath, utterancesForVideo, totalVideoDuration } =
        await mixAudioForRecap(utterancesWithAudio, ttsOutputDir, videoDuration);

      // Cleanup TTS clips
      utterancesWithAudio.forEach(u => {
        if (u.audioFilePath && fs.existsSync(u.audioFilePath)) fs.unlinkSync(u.audioFilePath);
      });

      const localUrl = `${baseUrl}/uploads/${path.basename(finalAudioPath)}`;
      console.log(`[Step 3 - AI Recap] Done. Total new video duration: ${totalVideoDuration.toFixed(2)}s`);
      return res.json({
        message: 'Recap processing complete',
        url: localUrl,
        finalAudioFilename: path.basename(finalAudioPath),
        utterancesForVideo,
        totalVideoDuration,
        recapMode: true
      });
    }

    // ── Dubbing Mode (unchanged) ──
    const { finalAudioPath, completeVideoSegments, updatedUtterances: finalUtterances } =
      await mixAudioOnly(utterancesWithAudio, ttsOutputDir, videoDuration);

    // Cleanup TTS clips
    utterancesWithAudio.forEach(u => { 
      if (u.audioFilePath && fs.existsSync(u.audioFilePath)) fs.unlinkSync(u.audioFilePath);
    });
    
    const localUrl = `${baseUrl}/uploads/${path.basename(finalAudioPath)}`;
    console.log(`[Step 3 - Dubbing] Process finished successfully.`);
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
    const presetRate = parseInt(((typeof voice === 'object' && voice.rate) || '+0%').replace('%', '')) || 0;
    const previewRate = `${20 + presetRate >= 0 ? '+' : ''}${20 + presetRate}%`;
    const synthOpts = {
      voice: typeof voice === 'string' ? voice : (voice.voice || 'my-MM-NilarNeural'),
      rate: previewRate,  // 1.2x base + voice preset offset
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



// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  // Assets (JS/CSS) can be cached forever (Vite adds content hash to filenames)
  app.use(express.static(path.join(__dirname, '../client/dist'), {
    maxAge: '1y',
    immutable: true,
    index: false, // Don't auto-serve index.html — we handle it below with no-cache
  }));

  // index.html must NEVER be cached — it references hashed JS/CSS filenames
  app.get(/(.*)/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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


