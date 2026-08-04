const fs = require('fs');
let content = fs.readFileSync('server/index.js', 'utf8');

// Insert after the Google login route
const googleLoginRouteEnd = "    res.status(500).json({ error: 'Authentication failed' });\n  }\n});\n";
const meRoute = `
// Get current user profile (to refresh role)
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    // Create a fresh token in case role changed
    const freshToken = jwt.sign(
      { id: user._id, email: user.email, name: user.name, picture: user.picture, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ token: freshToken, user: { id: user._id, email: user.email, name: user.name, picture: user.picture, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: 'Server error fetching user' });
  }
});
`;

content = content.replace(googleLoginRouteEnd, googleLoginRouteEnd + meRoute);
fs.writeFileSync('server/index.js', content);
console.log('Added /api/auth/me route');
