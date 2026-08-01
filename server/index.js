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
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name, picture: user.picture },
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
    
    // Create a fresh token in case role changed
    const freshToken = jwt.sign(
      { id: user._id, role: user.role, name: user.name, picture: user.picture },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ token: freshToken, user: { id: user._id, role: user.role, name: user.name, picture: user.picture } });
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

// Update API Keys
app.post('/api/admin/keys', requireAdmin, async (req, res) => {
  try {
    const { geminiKey, groqKey, assemblyAiKey } = req.body;
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ geminiKey, groqKey, assemblyAiKey });
    } else {
      settings.geminiKey = geminiKey;
      settings.groqKey = groqKey;
      settings.assemblyAiKey = assemblyAiKey;
      await settings.save();
    }
    res.json(settings);
  } catch (error) {
    console.error('Save error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
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
    if (!['free', 'premium', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// --- Main App Endpoints ---

// Step 1: Extract Audio and Transcribe
app.post('/api/step1-extract', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    console.log(`[Step 1] File received: ${req.file.originalname}. Transcribing via Groq...`);
    
    // We already have the audio extracted by the client!
    let assemblyAiKey = req.body.assemblyAiKey;
    
    // Fallback to database key
    if (!assemblyAiKey) {
      const settings = await Settings.findOne();
      if (settings && settings.assemblyAiKey) {
        assemblyAiKey = settings.assemblyAiKey;
      }
    }
    
    // Also prepare Groq key from database to pass it if needed (currently AssemblyAI service uses process.env.GROQ_API_KEY)
    // To support database key, we should ideally pass it to getTranscriptAndTimestamps, but for now we'll set process.env temporarily or modify the function.
    // Let's assume the service will check process.env, so let's inject it if missing
    const settings = await Settings.findOne();
    if (settings && settings.groqKey && !process.env.GROQ_API_KEY) {
      process.env.GROQ_API_KEY = settings.groqKey;
    } else if (settings && settings.groqKey) {
       // Override for this request (in production a better approach is passing it explicitly, but this works for local/single-tenant)
       process.env.GROQ_API_KEY = settings.groqKey;
    }

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

    let apiKey = req.body.apiKey;
    if (!apiKey) {
      const settings = await Settings.findOne();
      if (settings && settings.geminiKey) {
        apiKey = settings.geminiKey;
      }
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API Key is required (provide in request or save in Admin Dashboard)' });
    }
    
    console.log(`[Step 2] Received ${utterances.length} utterances for translation. Using API Key starting with: ${apiKey.substring(0, 10)}...`);
    const translatedUtterances = await translateUtterances(utterances, apiKey);
    
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
    const { finalAudioPath, completeVideoSegments, updatedUtterances: finalUtterances } = await mixAudioOnly(utterancesWithAudio, ttsOutputDir);
    
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

const server = app.listen(port, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`✅ Server running!`);
  console.log(`   Local:   http://localhost:${port}`);
  console.log(`   Network: http://${localIP}:${port}`);
});

// Disable timeouts to prevent 408 errors during large uploads
server.requestTimeout = 0;
server.headersTimeout = 0;
server.keepAliveTimeout = 0;
server.setTimeout(0);


