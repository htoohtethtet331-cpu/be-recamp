const fs = require('fs');

let content = fs.readFileSync('client/src/App.jsx', 'utf8');

// 1. Add imports
content = content.replace(
  "import { CheckCircle2, Download, RefreshCw, Play, Loader2, AlertTriangle, SlidersHorizontal, ArrowRight, Video, Sparkles, Copy } from 'lucide-react';",
  "import { CheckCircle2, Download, RefreshCw, Play, Loader2, AlertTriangle, SlidersHorizontal, ArrowRight, Video, Sparkles, Copy, Settings, Zap } from 'lucide-react';\nimport AdminDashboard from './components/AdminDashboard';"
);

// 2. Add appMode and showAdmin states
content = content.replace(
  "const [step, setStep] = useState(1);",
  "const [appMode, setAppMode] = useState('manual');\n  const [showAdmin, setShowAdmin] = useState(false);\n  const [step, setStep] = useState(1);"
);

// 3. Add Auto Mode Logic before handleExtract
content = content.replace(
  "const handleExtract = async () => {",
  `const handleAutoProcess = async () => {
    if (!file) { setError('Please select a video file first.'); return; }
    setLoading(true); setFfmpegProgress(0); setError('');

    try {
      setLoadingSteps(["AI က ဗီဒီယိုကို လေ့လာနေပါသည်...", "အသံဖိုင်ကို သီးသန့် ခွဲထုတ်နေပါသည်...", "စကားသံများကို နားထောင်ပြီး စာသားအဖြစ် ပြောင်းလဲနေပါသည်..."]);
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.writeFile('input_video.mp4', await fetchFile(file));
      await ffmpeg.exec(['-i', 'input_video.mp4', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', 'extracted_audio.mp3']);
      const audioData = await ffmpeg.readFile('extracted_audio.mp3');
      const formData = new FormData();
      formData.append('audio', new File([new Blob([audioData.buffer], { type: 'audio/mp3' })], 'extracted_audio.mp3', { type: 'audio/mp3' }));
      
      const extractRes = await axios.post(\`\${apiUrl}/step1-extract\`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const extractedUtterances = extractRes.data.utterances;

      setLoadingSteps(["အင်္ဂလိပ်စာသားများကို မြန်မာလို အလိုအလျောက် ဘာသာပြန်နေပါသည်...", "စကားပြောသကဲ့သို့ သဘာဝကျအောင် ပြုပြင်နေပါသည်..."]);
      const translateRes = await axios.post(\`\${apiUrl}/step2-translate\`, { utterances: extractedUtterances });
      const translatedUtterances = translateRes.data.translatedUtterances;

      setLoadingSteps(["AI က မြန်မာအသံထွက်များကို ဖန်တီးနေပါသည်...", "အသံအနှေးအမြန်များကို ကိုက်ညီအောင် ညှိနေပါသည်..."]);
      const ttsRes = await axios.post(\`\${apiUrl}/step3-tts\`, { translatedUtterances, voice: selectedVoice });
      
      setDownloadUrl(ttsRes.data.url);
      if (ttsRes.data.videoSegments) setVideoSegments(ttsRes.data.videoSegments);
      if (ttsRes.data.updatedUtterances) setUtterances(ttsRes.data.updatedUtterances);
      
      setStep(4);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Auto Process failed.');
    } finally {
      setLoading(false);
      setLoadingSteps([]);
    }
  };

  const handleExtract = async () => {`
);

// 4. Inject AdminDashboard return if showAdmin is true
content = content.replace(
  "if (!ffmpegLoaded) {",
  "if (showAdmin) return <AdminDashboard onBack={() => setShowAdmin(false)} />;\n\n  if (!ffmpegLoaded) {"
);

// 5. Inject the Header with Settings button and Top Nav Toggle for Auto/Manual
content = content.replace(
  '<div className="bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">',
  `<div className="bg-white/10 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden flex flex-col max-h-[90vh] relative z-10">`
);

content = content.replace(
  '<div className="p-4 border-b bg-gray-50 shrink-0 flex items-center justify-between">',
  `<div className="p-5 border-b border-white/10 bg-white/5 shrink-0 flex items-center justify-between backdrop-blur-md">`
);

content = content.replace(
  '<h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">',
  `<h1 className="text-xl font-bold text-white flex items-center gap-2 drop-shadow-md">`
);

content = content.replace(
  '<div className="text-xs text-gray-500 font-medium mt-0.5">',
  `<div className="text-xs text-white/70 font-medium mt-0.5">`
);

// Inject Admin button
content = content.replace(
  '</div>\n            </div>\n          </h1>',
  `</div>\n            </div>\n          </h1>\n          <button onClick={() => setShowAdmin(true)} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-sm border border-white/20 group">\n            <Settings className="w-5 h-5 text-white/80 group-hover:text-white group-hover:rotate-90 transition-transform duration-300" />\n          </button>`
);

// Inject Tab Toggle
content = content.replace(
  '<!-- WIZARD PROGRESS BAR -->',
  `{/* Mode Toggle */}\n          <div className="px-6 pt-4 pb-2 bg-white/5 border-b border-white/10">\n            <div className="flex p-1 bg-black/20 rounded-2xl border border-white/10 backdrop-blur-sm">\n              <button \n                onClick={() => { setAppMode('auto'); setStep(1); setFile(null); }}\n                className={\`flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 \${appMode === 'auto' ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20' : 'text-white/60 hover:text-white hover:bg-white/5'}\`}\n              >\n                <Zap className="w-4 h-4" /> Auto Mode\n              </button>\n              <button \n                onClick={() => { setAppMode('manual'); setStep(1); setFile(null); }}\n                className={\`flex-1 py-3 text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 \${appMode === 'manual' ? 'bg-white text-indigo-700 shadow-md' : 'text-white/60 hover:text-white hover:bg-white/5'}\`}\n              >\n                <SlidersHorizontal className="w-4 h-4" /> Manual Mode\n              </button>\n            </div>\n          </div>\n\n          {/* WIZARD PROGRESS BAR */}`
);

// Modify Auto Mode execution logic for Step 1 button
content = content.replace(
  '<button onClick={handleExtract}',
  `{appMode === 'auto' ? (\n              <button onClick={handleAutoProcess} disabled={!file} className={\`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3 \${!file ? 'bg-white/10 text-white/30 cursor-not-allowed' : 'bg-white text-indigo-600 shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:scale-[1.01]'}\`}>\n                <Sparkles className="w-6 h-6" /> Auto Translate & Dub\n              </button>\n            ) : (\n              <button onClick={handleExtract}`
);

// Close the ternary operator for Step 1 button
content = content.replace(
  'Extract Audio <ArrowRight className="w-5 h-5" />\n            </button>',
  'Extract Audio <ArrowRight className="w-5 h-5" />\n            </button>\n            )}'
);


fs.writeFileSync('client/src/App.jsx', content);
console.log('App.jsx updated successfully!');
