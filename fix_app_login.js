const fs = require('fs');
let content = fs.readFileSync('client/src/App.jsx', 'utf8');

const loginUI = `  if (!user) {
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

  if (location.pathname === '/admin') {`;

content = content.replace("  if (location.pathname === '/admin') {", loginUI);
fs.writeFileSync('client/src/App.jsx', content);
console.log('App.jsx updated with full-page login lock!');
