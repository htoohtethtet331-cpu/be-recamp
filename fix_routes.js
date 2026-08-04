const fs = require('fs');
let content = fs.readFileSync('client/src/App.jsx', 'utf8');

// 1. Add imports for Router
content = content.replace(
  "import { CheckCircle2, Download, RefreshCw, Play, Loader2, AlertTriangle, SlidersHorizontal, ArrowRight, Video, Sparkles, Copy, Settings, Zap } from 'lucide-react';",
  "import { CheckCircle2, Download, RefreshCw, Play, Loader2, AlertTriangle, SlidersHorizontal, ArrowRight, Video, Sparkles, Copy, Settings, Zap } from 'lucide-react';\nimport { useNavigate, useLocation } from 'react-router-dom';"
);

// 2. Add Router hooks
content = content.replace(
  "function App() {",
  "function App() {\n  const navigate = useNavigate();\n  const location = useLocation();"
);

// 3. Replace the Admin Dashboard return logic
content = content.replace(
  "if (showAdmin) return <AdminDashboard onBack={() => setShowAdmin(false)} />;",
  "if (location.pathname === '/admin') return <AdminDashboard onBack={() => navigate('/')} />;"
);

// 4. Replace the onClick for the Settings button to navigate to /admin
content = content.replace(
  '<button onClick={() => setShowAdmin(true)} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-sm border border-white/20 group">',
  '<button onClick={() => navigate(\'/admin\')} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-sm border border-white/20 group">'
);

fs.writeFileSync('client/src/App.jsx', content);
console.log('Routes fixed successfully!');
