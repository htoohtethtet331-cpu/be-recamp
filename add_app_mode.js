const fs = require('fs');
let content = fs.readFileSync('client/src/App.jsx', 'utf8');

// 1. Move isPremium up and add appMode state
content = content.replace(
  "  const { user, login, logout } = useAuth();\n",
  `  const { user, login, logout } = useAuth();\n  const isPremium = user?.role === 'admin' || user?.role === 'premium';\n  const [appMode, setAppMode] = useState('manual');\n  const [showPremiumModal, setShowPremiumModal] = useState(false);\n`
);

// Remove the old isPremium definition
content = content.replace(
  "  const isPremium = user?.role === 'admin' || user?.role === 'premium';\n  \n  if (isPremium) {",
  "  if (appMode === 'auto' && isPremium) {"
);

// 2. Add ModeSwitcher UI to Auto Mode Header
const autoModeHeaderMatch = '<h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">Recap Studio</h1>\n          </div>';

const modeSwitcher = `
          {/* Mode Switcher */}
          <div className="absolute left-1/2 -translate-x-1/2 bg-white/5 p-1 rounded-full flex items-center shadow-inner border border-white/10 hidden md:flex">
            <button onClick={() => setAppMode('manual')} className={\`px-6 py-2 rounded-full text-sm font-bold transition-all \${appMode === 'manual' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}\`}>Manual Editor</button>
            <button onClick={() => { if(!isPremium) setShowPremiumModal(true); else setAppMode('auto'); }} className={\`px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 \${appMode === 'auto' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}\`}><Sparkles className="w-4 h-4"/> Auto Mode</button>
          </div>
`;

content = content.replace(autoModeHeaderMatch, autoModeHeaderMatch + modeSwitcher);

// 3. Add ModeSwitcher UI to Manual Mode Header
const manualModeHeaderMatch = '<p className="text-xs text-white/70 hidden sm:block">Manual Editor Workflow</p>\n            </div>\n          </div>';

content = content.replace(manualModeHeaderMatch, manualModeHeaderMatch + modeSwitcher.replace('absolute left-1/2 -translate-x-1/2', 'hidden md:flex ml-4'));

// 4. Add the Premium Modal to the end of the return statement (inside the manual mode which is the default for free users)
// Wait, the Premium Modal should be accessible from anywhere. But if appMode === 'auto' it's only shown if isPremium, so free users will only see Manual Mode.
// Let's add the Modal inside the Manual Mode's main container.
const manualModeMainContentEnd = '</div>\n      <canvas ref={canvasRef} style={{ display: \'none\' }} />\n    </div>';

const premiumModal = `
      {/* Premium Modal */}
      {showPremiumModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0F172A] border border-white/20 rounded-3xl p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500"></div>
            
            <button onClick={() => setShowPremiumModal(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors">
              ✕
            </button>
            
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl mb-6 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2">Upgrade to Premium</h2>
            <p className="text-gray-400 mb-6">Auto Mode is a premium feature. Upgrade to automatically extract, translate, and synthesize your videos with one click!</p>
            
            <div className="space-y-4 mb-8">
              <div className="flex items-center gap-3 text-sm text-gray-300">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span>Blazing fast AI translation</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-300">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span>Zero manual editing required</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-300">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <span>Priority processing queue</span>
              </div>
            </div>
            
            <button onClick={() => { alert('Premium purchasing coming soon!'); setShowPremiumModal(false); }} className="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-500/30 transition-all hover:scale-[1.02]">
              Upgrade Now - $9.99/mo
            </button>
          </div>
        </div>
      )}
`;

content = content.replace(manualModeMainContentEnd, premiumModal + manualModeMainContentEnd);

fs.writeFileSync('client/src/App.jsx', content);
console.log('App Mode injected!');
