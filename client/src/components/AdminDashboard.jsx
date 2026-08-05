import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { KeyRound, CheckCircle2, Loader2, ArrowLeft, Users, ShieldAlert, Search, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard({ onBack }) {
  const [activeTab, setActiveTab] = useState('keys'); // 'keys' or 'users'
  const { token } = useAuth();

  const apiUrl = import.meta.env.PROD
    ? (import.meta.env.VITE_API_URL || '/api')
    : `http://${window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname}:5001/api`;

  // Keys state
  const [keys, setKeys] = useState({ geminiKey: '', groqKey: '', groqKeys: ['', '', '', '', ''], assemblyAiKey: '', packages: [] });
  const [showKeys, setShowKeys] = useState({ gemini: false, groq1: false, groq2: false, groq3: false, groq4: false, groq5: false, assembly: false });
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [savingKeys, setSavingKeys] = useState(false);
  const [keyMessage, setKeyMessage] = useState('');

  // Users state
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [userMessage, setUserMessage] = useState('');

  // Common API config
  const apiConfig = {
    headers: { Authorization: `Bearer ${token}` }
  };

  useEffect(() => {
    const fetchKeys = async () => {
      try {
        const response = await axios.get(`${apiUrl}/admin/keys`, apiConfig);
        const fetchedGroqKeys = response.data.groqKeys && response.data.groqKeys.length === 5 
          ? response.data.groqKeys 
          : ['', '', '', '', ''];
        
        setKeys({
          geminiKey: response.data.geminiKey || '',
          groqKey: response.data.groqKey || '',
          groqKeys: fetchedGroqKeys,
          assemblyAiKey: response.data.assemblyAiKey || '',
          packages: response.data.packages || []
        });
      } catch (error) {
        console.error('Failed to fetch keys:', error);
      } finally {
        setLoadingKeys(false);
      }
    };

    const fetchUsers = async () => {
      try {
        const response = await axios.get(`${apiUrl}/admin/users`, apiConfig);
        setUsers(response.data);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      } finally {
        setLoadingUsers(false);
      }
    };

    if (token) {
      fetchKeys();
      fetchUsers();
    }
  }, [token]);

  const handleAddPackage = () => {
    setKeys({
      ...keys,
      packages: [...keys.packages, { title: 'New Package', videos: 10, mmk: 0, bath: 0, isPopular: false, discount: 0 }]
    });
  };

  const handlePackageChange = (index, field, value) => {
    const newPackages = [...keys.packages];
    newPackages[index][field] = value;
    setKeys({ ...keys, packages: newPackages });
  };

  const handleRemovePackage = (index) => {
    const newPackages = keys.packages.filter((_, i) => i !== index);
    setKeys({ ...keys, packages: newPackages });
  };

  const handleSaveKeys = async (e) => {
    e.preventDefault();
    setSavingKeys(true);
    setKeyMessage('');
    try {
      await axios.post(`${apiUrl}/admin/keys`, keys, apiConfig);
      setKeyMessage('API Keys saved successfully!');
      setTimeout(() => setKeyMessage(''), 3000);
    } catch (error) {
      setKeyMessage('Error saving keys.');
    } finally {
      setSavingKeys(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    // Optimistic UI update
    setUsers(users.map(u => u._id === userId ? { ...u, role: newRole } : u));

    try {
      await axios.put(`${apiUrl}/admin/users/${userId}/role`, { role: newRole }, apiConfig);
      setUserMessage('Role updated successfully!');
      setTimeout(() => setUserMessage(''), 2000);
    } catch (error) {
      console.error('Failed to update role', error);
      setUserMessage('Error updating role.');
      setTimeout(() => setUserMessage(''), 2000);
    }
  };

  const handleLimitChange = async (userId, newLimit) => {
    const parsedLimit = parseInt(newLimit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 0) return;

    // Optimistic UI update
    setUsers(users.map(u => u._id === userId ? { ...u, videoLimit: parsedLimit } : u));

    try {
      await axios.put(`${apiUrl}/admin/users/${userId}/limit`, { videoLimit: parsedLimit }, apiConfig);
      setUserMessage('Video limit updated successfully!');
      setTimeout(() => setUserMessage(''), 2000);
    } catch (error) {
      console.error('Failed to update limit', error);
      setUserMessage('Error updating limit.');
      setTimeout(() => setUserMessage(''), 2000);
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8 max-w-2xl w-full relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6 relative z-10"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="font-medium text-sm">Back to Studio</span>
      </button>

      <div className="flex items-center gap-3 mb-6 relative z-10">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
          <ShieldAlert className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>
          <p className="text-sm text-gray-400">Manage API keys and user access</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/10 pb-2 relative z-10">
        <button
          onClick={() => setActiveTab('keys')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${activeTab === 'keys' ? 'bg-blue-500/20 text-blue-300' : 'text-gray-400 hover:bg-white/10'}`}
        >
          <KeyRound className="w-4 h-4" /> API Keys
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${activeTab === 'users' ? 'bg-blue-500/20 text-blue-300' : 'text-gray-400 hover:bg-white/10'}`}
        >
          <Users className="w-4 h-4" /> User Management
        </button>
      </div>

      <div className="relative z-10 min-h-[300px]">
        {activeTab === 'keys' && (
          loadingKeys ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-16 h-16 relative flex items-center justify-center">
                <div className="absolute h-full w-full animate-ping rounded-full bg-blue-400 opacity-20"></div>
                <div className="absolute h-10 w-10 animate-pulse rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 shadow-xl shadow-blue-500/30"></div>
                <Loader2 className="w-5 h-5 text-white animate-spin relative z-10" />
              </div>
              <p className="text-sm font-medium text-blue-300 animate-pulse">Loading Keys...</p>
            </div>
          ) : (
            <form onSubmit={handleSaveKeys} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">Gemini API Key (Fallback Translation)</label>
                <div className="relative">
                  <input type={showKeys.gemini ? "text" : "password"} value={keys.geminiKey} onChange={(e) => setKeys({ ...keys, geminiKey: e.target.value })} className="w-full bg-black/20 border border-white/10 text-white rounded-xl pl-4 pr-12 py-3 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-gray-600" placeholder="AIzaSy..." />
                  <button type="button" onClick={() => setShowKeys({ ...showKeys, gemini: !showKeys.gemini })} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                    {showKeys.gemini ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              
              <div className="space-y-3 pt-2">
                <label className="block text-sm font-semibold text-gray-300">Groq API Keys (Primary Translation)</label>
                <p className="text-xs text-gray-400 -mt-2 mb-2">Configure up to 5 Groq keys. The system will cycle through them automatically if one hits a rate limit.</p>
                {[0, 1, 2, 3, 4].map((index) => (
                  <div key={`groq-${index}`} className="relative">
                    <input 
                      type={showKeys[`groq${index + 1}`] ? "text" : "password"} 
                      value={keys.groqKeys[index] || ''} 
                      onChange={(e) => {
                        const newGroqKeys = [...keys.groqKeys];
                        newGroqKeys[index] = e.target.value;
                        setKeys({ ...keys, groqKeys: newGroqKeys });
                      }} 
                      className="w-full bg-black/20 border border-white/10 text-white rounded-xl pl-4 pr-12 py-3 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-gray-600" 
                      placeholder={`gsk_... (Key ${index + 1})`} 
                    />
                    <button type="button" onClick={() => setShowKeys({ ...showKeys, [`groq${index + 1}`]: !showKeys[`groq${index + 1}`] })} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                      {showKeys[`groq${index + 1}`] ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">AssemblyAI API Key (Transcription Fallback)</label>
                <div className="relative">
                  <input type={showKeys.assembly ? "text" : "password"} value={keys.assemblyAiKey} onChange={(e) => setKeys({ ...keys, assemblyAiKey: e.target.value })} className="w-full bg-black/20 border border-white/10 text-white rounded-xl pl-4 pr-12 py-3 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-gray-600" />
                  <button type="button" onClick={() => setShowKeys({ ...showKeys, assembly: !showKeys.assembly })} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                    {showKeys.assembly ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              {/* Pricing Packages */}
              <div className="pt-6 border-t border-white/10 mt-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">Pricing Packages</h3>
                    <p className="text-xs text-gray-400">Configure the upgrade packages shown to users.</p>
                  </div>
                  <button type="button" onClick={handleAddPackage} className="px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white rounded-lg text-sm font-bold transition">
                    + Add Package
                  </button>
                </div>
                <div className="space-y-4">
                  {keys.packages.map((pkg, index) => (
                    <div key={index} className="p-4 bg-white/5 border border-white/10 rounded-xl relative space-y-3">
                      <button type="button" onClick={() => handleRemovePackage(index)} className="absolute top-2 right-2 text-red-400 hover:text-red-300">
                        ✕
                      </button>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Title</label>
                          <input type="text" value={pkg.title} onChange={(e) => handlePackageChange(index, 'title', e.target.value)} className="w-full bg-black/20 border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Videos</label>
                          <input type="number" value={pkg.videos} onChange={(e) => handlePackageChange(index, 'videos', e.target.value === '' ? '' : parseInt(e.target.value))} className="w-full bg-black/20 border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Price (MMK)</label>
                          <input type="number" value={pkg.mmk} onChange={(e) => handlePackageChange(index, 'mmk', e.target.value === '' ? '' : parseInt(e.target.value))} className="w-full bg-black/20 border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Price (Bath)</label>
                          <input type="number" value={pkg.bath} onChange={(e) => handlePackageChange(index, 'bath', e.target.value === '' ? '' : parseInt(e.target.value))} className="w-full bg-black/20 border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">Discount (%)</label>
                          <input type="number" value={pkg.discount || 0} onChange={(e) => handlePackageChange(index, 'discount', e.target.value === '' ? 0 : parseInt(e.target.value))} className="w-full bg-black/20 border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={pkg.isPopular} onChange={(e) => handlePackageChange(index, 'isPopular', e.target.checked)} className="rounded bg-black/20 border-white/10" id={`popular-${index}`} />
                        <label htmlFor={`popular-${index}`} className="text-sm text-gray-300">Mark as Popular</label>
                      </div>
                    </div>
                  ))}
                  {keys.packages.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">No packages configured.</p>
                  )}
                </div>
              </div>

              <button type="submit" disabled={savingKeys} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 mt-4">
                {savingKeys ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                <span>{savingKeys ? 'Saving...' : 'Save Configuration'}</span>
              </button>
              {keyMessage && <div className="text-center p-3 bg-green-50/50 text-green-700 rounded-lg text-sm font-medium border border-green-200/50 mt-4 backdrop-blur-sm">{keyMessage}</div>}

            </form>
          )
        )}

        {activeTab === 'users' && (
          loadingUsers ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-16 h-16 relative flex items-center justify-center">
                <div className="absolute h-full w-full animate-ping rounded-full bg-purple-400 opacity-20"></div>
                <div className="absolute h-10 w-10 animate-pulse rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 shadow-xl shadow-purple-500/30"></div>
                <Users className="w-5 h-5 text-white animate-bounce relative z-10" />
              </div>
              <p className="text-sm font-medium text-purple-300 animate-pulse">Loading Users...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search user by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 text-white rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-gray-500 text-sm"
                />
              </div>

              {userMessage && (
                <div className={`text-center p-3 rounded-lg text-sm font-medium border backdrop-blur-sm ${userMessage.includes('successfully') ? 'bg-green-50/50 text-green-700 border-green-200/50' : 'bg-red-50/50 text-red-700 border-red-200/50'}`}>
                  {userMessage}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="pb-3 text-sm font-semibold text-gray-400">User</th>
                      <th className="pb-3 text-sm font-semibold text-gray-400">Email</th>
                      <th className="pb-3 text-sm font-semibold text-gray-400">Limit</th>
                      <th className="pb-3 text-sm font-semibold text-gray-400">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase())).map((u) => (
                      <tr key={u._id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                        <td className="py-4 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                            {u.picture ? <img src={u.picture} alt={u.name} className="w-8 h-8 rounded-full" /> : u.name.charAt(0)}
                          </div>
                          <span className="font-medium text-sm text-gray-200">{u.name}</span>
                        </td>
                        <td className="py-4 text-sm text-gray-400">{u.email}</td>
                        <td className="py-4">
                          <input
                            type="number"
                            min="0"
                            disabled={u.role === 'free'}
                            value={u.videoLimit !== undefined ? u.videoLimit : 0}
                            onChange={(e) => setUsers(users.map(user => user._id === u._id ? { ...user, videoLimit: e.target.value } : user))}
                            onBlur={(e) => handleLimitChange(u._id, e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleLimitChange(u._id, e.target.value); }}
                            className={`bg-black/30 border border-white/10 text-gray-300 text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-purple-500/50 w-20 ${u.role === 'free' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          />
                        </td>
                        <td className="py-4">
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u._id, e.target.value)}
                            className="bg-black/30 border border-white/10 text-gray-300 text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-purple-500/50"
                          >
                            <option value="free">Free</option>
                            <option value="premium">Premium</option>
                            <option value="admin">Admin</option>
                            <option value="restrict">Restrict</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {users.filter(u => u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                  <p className="text-center text-gray-500 mt-6">No users found.</p>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
