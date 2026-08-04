const fs = require('fs');

let content = fs.readFileSync('server/index.js', 'utf8');

// 1. Imports at the top
content = content.replace(
  "const { OpenAI } = require('openai');",
  "const { OpenAI } = require('openai');\nconst { OAuth2Client } = require('google-auth-library');\nconst jwt = require('jsonwebtoken');\nconst User = require('./models/User');\nconst { requireAuth, requireAdmin, JWT_SECRET } = require('./middleware/auth');\n\nconst googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);"
);

// 2. Auth Route
const authRoute = `
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
      // If it's the very first user in the DB, make them admin automatically
      const userCount = await User.countDocuments();
      const role = userCount === 0 ? 'admin' : 'free';
      
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
`;

content = content.replace("// --- Admin Endpoints ---", authRoute + "\n// --- Admin Endpoints ---");

// 3. Protect Admin Keys Routes
content = content.replace("app.get('/api/admin/keys', async (req, res) => {", "app.get('/api/admin/keys', requireAdmin, async (req, res) => {");
content = content.replace("app.post('/api/admin/keys', async (req, res) => {", "app.post('/api/admin/keys', requireAdmin, async (req, res) => {");

// 4. Add User Management Routes
const userManageRoutes = `
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

`;

content = content.replace("// --- Main App Endpoints ---", userManageRoutes + "// --- Main App Endpoints ---");

fs.writeFileSync('server/index.js', content);
console.log('server/index.js updated for Auth and Admin User Management!');
