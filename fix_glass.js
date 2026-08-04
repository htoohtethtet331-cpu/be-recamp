const fs = require('fs');

let content = fs.readFileSync('client/src/App.jsx', 'utf8');

// Replace all light backgrounds inside the app with translucent black/white
content = content.replace(/bg-green-50/g, 'bg-black/20');
content = content.replace(/bg-red-50/g, 'bg-red-900/40 text-white');
content = content.replace(/bg-gray-100/g, 'bg-white/10');
content = content.replace(/bg-gray-200/g, 'bg-white/20');
content = content.replace(/bg-gray-300/g, 'bg-white/30 text-white/50');
content = content.replace(/bg-gray-50/g, 'bg-black/20');
content = content.replace(/bg-white/g, 'bg-white/10');
content = content.replace(/backdrop-blur-sm/g, 'backdrop-blur-xl');

// Ensure text is white where it might still be gray
content = content.replace(/text-gray-[0-9]{3}/g, 'text-white/90');
content = content.replace(/text-blue-500/g, 'text-blue-300');
content = content.replace(/text-blue-600/g, 'text-blue-300');
content = content.replace(/text-green-700/g, 'text-green-300');
content = content.replace(/text-green-800/g, 'text-green-300');

// Fix border colors
content = content.replace(/border-gray-[0-9]{3}/g, 'border-white/20');
content = content.replace(/border-blue-[0-9]{3}/g, 'border-white/20');
content = content.replace(/border-green-[0-9]{3}/g, 'border-white/20');

// Fix the main container which might have been converted to bg-white/10/10
content = content.replace(/bg-white\/10\/10/g, 'bg-white/10');

// Ensure the Step cards are legible
content = content.replace(/bg-black\/20 rounded-2xl p-5 border border-white\/20/g, 'bg-black/20 backdrop-blur-md rounded-2xl p-5 border border-white/20');

fs.writeFileSync('client/src/App.jsx', content);
console.log('App.jsx glass fixed successfully!');
