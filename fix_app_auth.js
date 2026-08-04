const fs = require('fs');

let content = fs.readFileSync('client/src/App.jsx', 'utf8');

// 1. Add Auth imports
content = content.replace(
  "import { useNavigate, useLocation } from 'react-router-dom';",
  "import { useNavigate, useLocation } from 'react-router-dom';\nimport { GoogleLogin } from '@react-oauth/google';\nimport { useAuth } from './context/AuthContext';\nimport { LogOut } from 'lucide-react';"
);

// 2. Add auth hook inside App
content = content.replace(
  "const location = useLocation();",
  "const location = useLocation();\n  const { user, login, logout } = useAuth();"
);

// 3. Add handleGoogleSuccess function
const authFuncs = `
  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: credentialResponse.credential })
      });
      const data = await res.json();
      if (res.ok) {
        login(data.token);
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error('Login error', err);
    }
  };
`;
content = content.replace("const [error, setError] = useState(null);", "const [error, setError] = useState(null);\n" + authFuncs);

// 4. Update Admin Dashboard routing to protect it
content = content.replace(
  "if (location.pathname === '/admin') return <AdminDashboard onBack={() => navigate('/')} />;",
  "if (location.pathname === '/admin') {\n    if (!user || user.role !== 'admin') {\n      return (\n        <div className=\"min-h-screen bg-[#0F172A] flex flex-col items-center justify-center text-white p-4\">\n          <AlertTriangle className=\"w-16 h-16 text-red-500 mb-4\" />\n          <h2 className=\"text-2xl font-bold mb-2\">Access Denied</h2>\n          <p className=\"text-gray-400 mb-6\">You need Administrator privileges to view this page.</p>\n          <button onClick={() => navigate('/')} className=\"px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl font-medium transition-colors\">\n            Return Home\n          </button>\n        </div>\n      );\n    }\n    return <AdminDashboard onBack={() => navigate('/')} />;\n  }"
);

// 5. Add Login button and User Profile to Header (Navbar)
const headerRegex = /<h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">\\s*Recap Studio\\s*<\/h1>\\s*<\/div>/;

const userUI = `
          <div className="flex items-center gap-4">
            {!user ? (
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => console.log('Login Failed')}
                theme="filled_black"
                shape="pill"
              />
            ) : (
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full pl-2 pr-4 py-1.5">
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
            )}
            {user?.role === 'admin' && (
              <button onClick={() => navigate('/admin')} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all shadow-sm border border-white/20 group">
                <Settings className="w-5 h-5 text-gray-300 group-hover:text-white group-hover:rotate-90 transition-all duration-300" />
              </button>
            )}
          </div>
`;

content = content.replace(/<button onClick=\{\(\) => navigate\('\/admin'\)\} className="p-2\.5 bg-white\/10 hover:bg-white\/20 rounded-xl transition-all shadow-sm border border-white\/20 group">\s*<Settings className="w-5 h-5 text-gray-300 group-hover:text-white group-hover:rotate-90 transition-all duration-300" \/>\s*<\/button>/, ''); // Remove old Settings button

// Now insert the new User UI after the Logo div
content = content.replace('</h1>\n          </div>', '</h1>\n          </div>\n' + userUI);


fs.writeFileSync('client/src/App.jsx', content);
console.log('App.jsx updated with Google Auth UI and route protection!');
