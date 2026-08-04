const fs = require('fs');
let content = fs.readFileSync('client/src/App.jsx', 'utf8');

// Replace the main wrapper div
content = content.replace(
  '<div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-sans">',
  '<div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4 sm:p-8 font-sans">'
);

// We already changed the main card container in the previous script to:
// <div className="bg-white/10 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden flex flex-col max-h-[90vh] relative z-10">

fs.writeFileSync('client/src/App.jsx', content);
console.log('App.jsx background updated successfully!');
