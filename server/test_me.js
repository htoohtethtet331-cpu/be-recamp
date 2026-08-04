const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_development_only';

async function test() {
  const token = jwt.sign(
    { id: '123', email: 'test@test.com', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  const fetch = (await import('node-fetch')).default;
  const res = await fetch('http://localhost:5001/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('STATUS:', res.status);
  console.log('BODY:', await res.text());
  process.exit(0);
}
test().catch(console.error);
