const fs = require('fs');

let content = fs.readFileSync('server/index.js', 'utf8');

const oldLogic = `      // If it's the very first user in the DB, make them admin automatically
      const userCount = await User.countDocuments();
      const role = userCount === 0 ? 'admin' : 'free';
      
      user = await User.create({ name, email, picture, role });`;

const newLogic = `      // Set tiktokjaxon709@gmail.com as hardcoded admin, others default to free
      const role = email === 'tiktokjaxon709@gmail.com' ? 'admin' : 'free';
      user = await User.create({ name, email, picture, role });`;

content = content.replace(oldLogic, newLogic);
fs.writeFileSync('server/index.js', content);
console.log('server/index.js updated for hardcoded admin email!');
