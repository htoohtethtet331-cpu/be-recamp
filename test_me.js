const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('./server/models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_development_only';

async function test() {
  await mongoose.connect('mongodb+srv://htoohtethtet331:c7i4T3qUa4Fp1b4H@cluster0.b7uio.mongodb.net/recap-studio?retryWrites=true&w=majority', { useNewUrlParser: true, useUnifiedTopology: true });
  const user = await User.findOne({ email: 'htoohtethtet331@gmail.com' });
  const token = jwt.sign(
    { id: user._id, role: user.role, name: user.name, picture: user.picture },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  const fetch = require('node-fetch');
  const res = await fetch('http://localhost:5001/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(res.status);
  console.log(await res.text());
  process.exit(0);
}
test();
