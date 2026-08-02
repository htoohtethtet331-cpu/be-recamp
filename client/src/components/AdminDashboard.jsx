import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { KeyRound, CheckCircle2, Loader2, ArrowLeft, Users, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard({ onBack }) {
  const [activeTab, setActiveTab] = useState('keys'); // 'keys' or 'users'
  const { token } = useAuth();
  
  const apiUrl = import.meta.env.PROD
    ? (import.meta.env.VITE_API_URL || '/api')
    : `http://${window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname}:5001/api`;

  // Keys state
  const [keys, setKeys] = useState({ geminiKey: '', groqKey: '', assemblyAiKey: '' });
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [savingKeys, setSavingKeys] = useState(false);
  const [keyMessage, setKeyMessage] = useState('');

  // Users state
  const [users, setUsers] = useState([]);
  const [draftRoles, setDraftRoles] = useState({});
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [savingUsers, setSavingUsers] = useState(false);
  const [userMessage, setUserMessage] = useState('');

  // Common API config
  const apiConfig = {
    headers: { Authorization: `Bearer ${token}` }
  };

  useEffect(() => {
    const fetchKeys = async () => {
      try {
        const response = await axios.get(`${apiUrl}/admin/keys`, apiConfig);
        setKeys({
          geminiKey: response.data.geminiKey || '',
          groqKey: response.data.groqKey || '',
          assemblyAiKey: response.data.assemblyAiKey || ''
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
        const roles = {};
        response.data.forEach(u => {
          roles[u._id] = u.role;
        });
        setDraftRoles(roles);
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

  const handleRoleChange = (userId, newRole) => {
    setDraftRoles({ ...draftRoles, [userId]: newRole });
  };

  const handleSaveUsers = async (e) => {
    e.preventDefault();
    setSavingUsers(true);
    setUserMessage('');
    try {
      // Find all users whose roles have changed
      const updates = users.map(async (u) => {
        if (draftRoles[u._id] && draftRoles[u._id] !== u.role) {
          await axios.put(`${apiUrl}/admin/users/${u._id}/role`, { role: draftRoles[u._id] }, apiConfig);
        }
      });
      await Promise.all(updates);
      
      // Update local users state
      setUsers(users.map(u => ({ ...u, role: draftRoles[u._id] || u.role })));
      setUserMessage('User roles saved successfully!');
      setTimeout(() => setUserMessage(''), 3000);
    } catch (error) {
      console.error('Failed to update roles', error);
      setUserMessage('Error saving user roles.');
    } finally {
      setSavingUsers(false);
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
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">OpenRouter API Key (For Translation)</label>
                <input type="password" value={keys.geminiKey} onChange={(e) => setKeys({...keys, geminiKey: e.target.value})} className="w-full bg-black/20 border border-white/10 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-gray-600" placeholder="AIzaSy..." />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">Groq API Key</label>
                <input type="password" value={keys.groqKey} onChange={(e) => setKeys({...keys, groqKey: e.target.value})} className="w-full bg-black/20 border border-white/10 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-gray-600" placeholder="gsk_..." />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">AssemblyAI API Key</label>
                <input type="password" value={keys.assemblyAiKey} onChange={(e) => setKeys({...keys, assemblyAiKey: e.target.value})} className="w-full bg-black/20 border border-white/10 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-gray-600" />
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
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="pb-3 text-sm font-semibold text-gray-400">User</th>
                    <th className="pb-3 text-sm font-semibold text-gray-400">Email</th>
                    <th className="pb-3 text-sm font-semibold text-gray-400">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                      <td className="py-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                          {u.picture ? <img src={u.picture} alt={u.name} className="w-8 h-8 rounded-full" /> : u.name.charAt(0)}
                        </div>
                        <span className="font-medium text-sm text-gray-200">{u.name}</span>
                      </td>
                      <td className="py-4 text-sm text-gray-400">{u.email}</td>
                      <td className="py-4">
                        <select 
                          value={draftRoles[u._id] || u.role} 
                          onChange={(e) => handleRoleChange(u._id, e.target.value)}
                          className="bg-black/30 border border-white/10 text-gray-300 text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-purple-500/50"
                        >
                          <option value="free">Free</option>
                          <option value="premium">Premium</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && <p className="text-center text-gray-500 mt-6">No users found.</p>}
              
              {users.length > 0 && (
                <div className="mt-6">
                  <button 
                    onClick={handleSaveUsers}
                    disabled={savingUsers} 
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2"
                  >
                    {savingUsers ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    <span>{savingUsers ? 'Saving...' : 'Save User Roles'}</span>
                  </button>
                  {userMessage && (
                    <div className={`text-center p-3 rounded-lg text-sm font-medium border mt-4 backdrop-blur-sm ${userMessage.includes('successfully') ? 'bg-green-50/50 text-green-700 border-green-200/50' : 'bg-red-50/50 text-red-700 border-red-200/50'}`}>
                      {userMessage}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
