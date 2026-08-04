const fs = require('fs');
let content = fs.readFileSync('client/src/App.jsx', 'utf8');

const regexRenderAutoMode = /\{\!file \? \([\s\S]*?\{\error && \(/m;

const newUi = `{!file ? (
              <label htmlFor="auto-file-upload" className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-purple-600 text-white shadow-lg shadow-purple-500/30 hover:bg-purple-500 cursor-pointer">
                <UploadCloud className="w-6 h-6" /> Select Video
              </label>
            ) : finalVideoUrl ? (
              <div className="space-y-4">
                <div className="w-full bg-black/50 rounded-xl overflow-hidden shadow-inner border border-white/10 mt-4">
                  <video src={finalVideoUrl} controls className="w-full max-h-64 object-contain" />
                </div>
                <a 
                  href={finalVideoUrl} 
                  download="auto_translated_video.mp4"
                  className="w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 hover:scale-[1.02]"
                >
                  <Download className="w-6 h-6" />
                  Download Final Video
                </a>
                <button 
                  onClick={() => { setFile(null); setFinalVideoUrl(''); setStep(0); }}
                  className="w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20"
                >
                  <RefreshCw className="w-5 h-5" />
                  Translate Another Video
                </button>
              </div>
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
            
            {error && (`;

content = content.replace(regexRenderAutoMode, newUi);

fs.writeFileSync('client/src/App.jsx', content);
console.log('App.jsx Auto Mode UI updated!');
