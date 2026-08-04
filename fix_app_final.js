const fs = require('fs');
let content = fs.readFileSync('client/src/App.jsx', 'utf8');

const returnTarget = "  return (\n    <div className=\"min-h-screen bg-[#0F172A]";
const returnPoint = content.indexOf(returnTarget);

const loginAndAutoMode = `  if (!user) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-10 rounded-3xl text-center shadow-2xl max-w-md w-full">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome to Recap Studio
          </h1>
          <p className="text-gray-400 mb-10">Please sign in to access your dashboard.</p>
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => console.log('Login Failed')}
              theme="filled_blue"
              size="large"
              shape="pill"
              text="continue_with"
            />
          </div>
        </div>
      </div>
    );
  }

  if (location.pathname === '/admin') {
    if (!user || user.role !== 'admin') {
      return (
        <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center text-white p-4">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-gray-400 mb-6">You need Administrator privileges to view this page.</p>
          <button onClick={() => navigate('/')} className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl font-medium transition-colors">
            Return Home
          </button>
        </div>
      );
    }
    return <AdminDashboard onBack={() => navigate('/')} />;
  }

  const isPremium = user?.role === 'admin' || user?.role === 'premium';
  
  if (isPremium) {
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
                  onClick={() => { setFile(null); setFinalVideoUrl(''); }}
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

`;

content = content.slice(0, returnPoint) + loginAndAutoMode + content.slice(returnPoint);

// Inject user profile into manual mode header
const manualHeaderTarget = `<div className="flex gap-1 text-xs font-bold text-blue-400">`;
const manualHeaderPoint = content.indexOf(manualHeaderTarget);
const manualUserProfile = `
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full pl-2 pr-4 py-1.5 ml-8">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full border border-purple-500/50" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold text-sm">
                  {user.name.charAt(0)}
                </div>
              )}
              <div className="flex flex-col">
                <span className="text-sm font-medium text-white leading-none">{user.name}</span>
                <span className="text-[10px] text-purple-400 uppercase tracking-wider font-bold mt-1">{user.role}</span>
              </div>
              <button onClick={logout} className="ml-2 p-1.5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition-colors" title="Logout">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
          `;

content = content.slice(0, manualHeaderPoint) + manualUserProfile + content.slice(manualHeaderPoint);

fs.writeFileSync('client/src/App.jsx', content);
console.log('App.jsx fully injected!');
