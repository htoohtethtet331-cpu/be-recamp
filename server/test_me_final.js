const jwt = require('jsonwebtoken');
require('dotenv').config();

async function test() {
  const token = jwt.sign(
    { id: '123', email: 'htoohtethtet331@gmail.com', role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  
  const fetch = (await import('node-fetch')).default;
  const res = await fetch('http://localhost:5001/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log('STATUS:', res.status);
  console.log('HEADERS:', res.headers.raw());
  console.log('BODY:', await res.text());
  process.exit(0);
}
test().catch(console.error);
