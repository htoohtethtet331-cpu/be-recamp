const fs = require('fs');

let content = fs.readFileSync('client/src/App.jsx', 'utf8');

// The main wrapper was already changed by the previous script, but let's ensure it has text-white
content = content.replace(
  'min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4 sm:p-8 font-sans',
  'min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4 sm:p-8 font-sans text-white'
);

// Main app container
content = content.replace(
  'bg-white rounded-[2rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] w-full max-w-2xl overflow-hidden border border-blue-50 flex flex-col max-h-[90vh]',
  'bg-white/10 backdrop-blur-2xl rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh]'
);

// Header area
content = content.replace(/bg-blue-50\/50/g, 'bg-white/5 border-b border-white/10');
content = content.replace(/bg-blue-50/g, 'bg-white/10');
content = content.replace(/border-blue-100/g, 'border-white/20');

// Text colors (general replacement but careful)
content = content.replace(/text-gray-900/g, 'text-white');
content = content.replace(/text-gray-800/g, 'text-white');
content = content.replace(/text-gray-700/g, 'text-white/90');
content = content.replace(/text-gray-600/g, 'text-white/80');
content = content.replace(/text-gray-500/g, 'text-white/70');
content = content.replace(/text-gray-400/g, 'text-white/50');
content = content.replace(/text-blue-600/g, 'text-blue-300');
content = content.replace(/text-blue-700/g, 'text-blue-200');

// File Upload box
content = content.replace(/bg-green-50\/50/g, 'bg-white/5');
content = content.replace(/border-green-200/g, 'border-white/30');
content = content.replace(/hover:bg-green-50/g, 'hover:bg-white/10');
content = content.replace(/text-green-800/g, 'text-green-300');
content = content.replace(/text-green-600/g, 'text-green-400');

content = content.replace(/border-dashed border-gray-300/g, 'border-dashed border-white/40');
content = content.replace(/hover:border-blue-400 hover:bg-blue-50/g, 'hover:border-white hover:bg-white/10');

// Textareas
content = content.replace(/bg-gray-50/g, 'bg-black/20');
content = content.replace(/border-gray-200/g, 'border-white/30');
content = content.replace(/border-gray-100/g, 'border-white/20');
content = content.replace(/focus:ring-blue-500/g, 'focus:ring-blue-400');
content = content.replace(/focus:border-blue-500/g, 'focus:border-blue-400');

// Small panels inside steps (like manual translation inputs)
content = content.replace(/bg-white/g, 'bg-white/10 backdrop-blur-md');

// Buttons
content = content.replace(/bg-gray-100/g, 'bg-white/20');
content = content.replace(/hover:bg-gray-100/g, 'hover:bg-white/20');
content = content.replace(/hover:bg-gray-200/g, 'hover:bg-white/30');

// Header title
content = content.replace(/text-white\/90/g, 'text-white drop-shadow-md');

fs.writeFileSync('client/src/App.jsx', content);
console.log('App.jsx styles updated!');
