const fs = require('fs');
let content = fs.readFileSync('client/src/App.jsx', 'utf8');

// 1. Rewrite handleAutoProcess to include handleMerge automatically
const newAutoProcess = `  const handleAutoProcess = async () => {
    if (!file) { setError('Please select a video file first.'); return; }
    setLoading(true); setFfmpegProgress(0); setError('');

    try {
      setLoadingSteps(["[1/4] AI က ဗီဒီယိုကို လေ့လာနေပါသည်...", "အသံဖိုင်ကို သီးသန့် ခွဲထုတ်နေပါသည်..."]);
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.writeFile('input_video.mp4', await fetchFile(file));
      await ffmpeg.exec(['-i', 'input_video.mp4', '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', 'extracted_audio.mp3']);
      const audioData = await ffmpeg.readFile('extracted_audio.mp3');
      const formData = new FormData();
      formData.append('audio', new File([new Blob([audioData.buffer], { type: 'audio/mp3' })], 'extracted_audio.mp3', { type: 'audio/mp3' }));
      
      const extractRes = await axios.post('/api/step1-extract', formData, { headers: { 'Content-Type': 'multipart/form-data', Authorization: \`Bearer \${token}\` } });
      const extractedUtterances = extractRes.data.utterances;

      setLoadingSteps(["[2/4] အင်္ဂလိပ်စာသားများကို မြန်မာလို အလိုအလျောက် ဘာသာပြန်နေပါသည်...", "စကားပြောသကဲ့သို့ သဘာဝကျအောင် ပြုပြင်နေပါသည်..."]);
      const translateRes = await axios.post('/api/step2-translate', { utterances: extractedUtterances }, { headers: { Authorization: \`Bearer \${token}\` } });
      const translatedUtterances = translateRes.data.translatedUtterances;

      setLoadingSteps(["[3/4] AI က မြန်မာအသံထွက်များကို ဖန်တီးနေပါသည်...", "အသံအနှေးအမြန်များကို ကိုက်ညီအောင် ညှိနေပါသည်..."]);
      const ttsRes = await axios.post('/api/step3-tts', { translatedUtterances, voice: selectedVoice }, { headers: { Authorization: \`Bearer \${token}\` } });
      const audioUrl = ttsRes.data.url;
      
      setLoadingSteps(["[4/4] ဗီဒီယိုနှင့် အသံဖိုင်ကို ပြင်ဆင်နေပါသည်...", "AI က သင့်ဖုန်းအတွင်း၌ ဗီဒီယိုနှင့် အသံကို ပေါင်းစပ်နေပါသည်... (Local Processing)"]);
      
      // Automatic Merge
      const fetchedAudioData = await fetchFile(audioUrl);
      await ffmpeg.writeFile('merge_input_audio.mp3', fetchedAudioData);
      
      let filterComplex = '[1:a]atempo=1[aout]';
      const ffmpegArgs = [
        '-i', 'input_video.mp4',
        '-i', 'merge_input_audio.mp3',
        '-filter_complex', filterComplex,
        '-map', '0:v:0',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        'final_output.mp4'
      ];
      
      await ffmpeg.exec(ffmpegArgs);
      const finalData = await ffmpeg.readFile('final_output.mp4');
      const finalUrl = URL.createObjectURL(new Blob([finalData.buffer], { type: 'video/mp4' }));
      setFinalVideoUrl(finalUrl);
      
      setStep(5); // Go straight to Final Download Screen
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Auto Process failed.');
    } finally {
      setLoading(false);
    }
  };`;

// Replace the old handleAutoProcess entirely
const regexHandleAutoProcess = /const handleAutoProcess = async \(\) => \{[\s\S]*?finally \{\s*setLoading\(false\);\s*\}\s*\};\s*/m;
content = content.replace(regexHandleAutoProcess, newAutoProcess + "\n\n");

// 2. Add Auto Mode UI logic in Render
const regexRenderApp = /return \(\s*<div className="min-h-screen bg-\[#0F172A\] flex flex-col font-sans relative overflow-hidden">/m;
const renderAutoMode = `  const isPremium = user?.role === 'admin' || user?.role === 'premium';
  
  if (isPremium && step === 0) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col font-sans relative overflow-hidden text-white">
        {/* Navbar */}
        <div className="relative z-10 w-full px-6 py-4 flex justify-between items-center border-b border-white/10 bg-black/20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">Recap Studio</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full pl-2 pr-4 py-1.5">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full border border-purple-500/50" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold text-sm">{user.name.charAt(0)}</div>
              )}
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white leading-none">{user.name}</span>
                <span className="text-[10px] text-purple-400 uppercase tracking-wider font-bold mt-1">{user.role}</span>
              </div>
              <button onClick={logout} className="ml-2 p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition-colors"><LogOut className="w-4 h-4" /></button>
            </div>
            {user?.role === 'admin' && (
              <button onClick={() => navigate('/admin')} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-sm border border-white/20 group">
                <Settings className="w-5 h-5 text-gray-300 group-hover:text-white group-hover:rotate-90 transition-all duration-300" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
          <div className="max-w-xl w-full bg-white/5 backdrop-blur-2xl border border-white/10 p-8 rounded-3xl shadow-2xl text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-green-500/30">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold mb-4">Premium Auto Mode</h2>
            <p className="text-gray-400 mb-8">One-click video translation. We will extract, translate, synthesize, and merge automatically using Admin API Keys.</p>
            
            <input
              type="file"
              accept="video/*"
              id="auto-file-upload"
              className="hidden"
              onChange={handleFileChange}
            />
            
            {!file ? (
              <label htmlFor="auto-file-upload" className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-purple-600 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-500 cursor-pointer">
                <UploadCloud className="w-6 h-6" /> Select Video
              </label>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center gap-3 text-left">
                  <Video className="w-6 h-6 text-purple-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <button onClick={() => setFile(null)} className="p-2 text-gray-400 hover:text-red-400 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                
                <button 
                  onClick={handleAutoProcess} 
                  disabled={loading}
                  className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6" />}
                  {loading ? 'Processing...' : 'Start Auto Translate'}
                </button>
              </div>
            )}
            
            {error && (
              <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex gap-3 text-left">
                <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}
          </div>
        </div>
        <LoadingOverlay isLoading={loading} steps={loadingSteps} progress={ffmpegProgress} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex flex-col font-sans relative overflow-hidden">`;

content = content.replace(/return \(\s*<div className="min-h-screen bg-\[#0F172A\] flex flex-col font-sans relative overflow-hidden">/m, renderAutoMode);


fs.writeFileSync('client/src/App.jsx', content);
console.log('App.jsx updated with AutoMode!');
