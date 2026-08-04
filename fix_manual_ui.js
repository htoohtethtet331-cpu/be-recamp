const fs = require('fs');
let content = fs.readFileSync('client/src/App.jsx', 'utf8');

// Fix the main wrapper background for manual mode
content = content.replace(
  /<div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">/,
  '<div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4 font-sans text-white">'
);

// Fix the main card wrapper for manual mode
content = content.replace(
  /<div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 flex flex-col max-h-\[90vh\] relative">/,
  '<div className="bg-white/10 backdrop-blur-3xl rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden border border-white/20 flex flex-col max-h-[90vh] relative">'
);

// Header section inside the card
content = content.replace(
  /<div className="bg-white border-b border-slate-100 p-4 flex justify-between items-center shrink-0 z-10">/,
  '<div className="bg-black/20 border-b border-white/10 p-5 flex justify-between items-center shrink-0 z-10">'
);
content = content.replace(
  /<span className="font-black text-slate-800 text-xl tracking-tight">Recap Studio<\/span>/,
  '<span className="font-black text-white text-xl tracking-tight">Recap Studio</span>'
);
content = content.replace(
  /<span className="text-xs font-semibold text-slate-400">Manual Editor Workflow<\/span>/,
  '<span className="text-xs font-semibold text-blue-300">Manual Editor Workflow</span>'
);

// Steps navigation text
content = content.replace(
  /text-slate-400/g,
  'text-gray-400'
);
content = content.replace(
  /text-blue-600 font-bold/g,
  'text-blue-400 font-bold'
);

// Step 1 UI
content = content.replace(
  /bg-green-50/g,
  'bg-white/10'
);
content = content.replace(
  /border-green-300/g,
  'border-white/20'
);
content = content.replace(
  /hover:bg-green-100/g,
  'hover:bg-white/20'
);
content = content.replace(
  /text-gray-800/g,
  'text-white'
);

// Action buttons
content = content.replace(
  /bg-slate-200 text-slate-400/g,
  'bg-white/10 text-white/50'
);
content = content.replace(
  /bg-slate-800 text-white/g,
  'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30'
);

fs.writeFileSync('client/src/App.jsx', content);
console.log("Manual mode UI styled to Glassmorphism!");
