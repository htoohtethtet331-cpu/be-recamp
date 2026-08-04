import { createContext, useContext, useState, useEffect } from 'react';
import { jwtDecode } from "jwt-decode";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);

  const apiUrl = import.meta.env.PROD
    ? (import.meta.env.VITE_API_URL || '/api')
    : `http://${window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname}:5001/api`;

  useEffect(() => {
    if (token) {
      try {
        const decoded = jwtDecode(token);
        // Check if token is expired
        if (decoded.exp * 1000 < Date.now()) {
          logout();
        } else {
          setUser(decoded);
          localStorage.setItem('token', token);
          
            // Fetch fresh token to update role or limit if changed by admin
            fetch(`${apiUrl}/auth/me`, {
              headers: { 'Authorization': `Bearer ${token}` }
            })
            .then(res => res.json())
            .then(data => {
              if (data.token && data.user) {
                if (data.user.role !== decoded.role || data.user.videoLimit !== decoded.videoLimit) {
                  setToken(data.token);
                }
              }
            })
            .catch(err => console.error('Failed to refresh user', err));
          }
        } catch (error) {
          logout();
        }
      } else {
        setUser(null);
        localStorage.removeItem('token');
      }
    }, [token]);

    const login = (newToken) => {
      setToken(newToken);
    };

    const logout = () => {
      setToken(null);
      setUser(null);
      localStorage.removeItem('token');
      window.location.href = '/'; // Force redirect to home on logout
    };

    return (
      <AuthContext.Provider value={{ user, token, login, logout, setUser }}>
        {children}
      </AuthContext.Provider>
    );
};
