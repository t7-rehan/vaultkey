import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, loginUser, registerUser, logoutUser } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('vaultkey_theme') === 'dark';
  });

  useEffect(() => {
    // Apply dark mode class to root html element
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('vaultkey_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('vaultkey_theme', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  useEffect(() => {
    const token = localStorage.getItem('vaultkey_token');
    if (token) {
      getCurrentUser()
        .then(u => setUser(u))
        .catch(() => {
          logoutUser();
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await loginUser(email, password);
    setUser(res.user);
    return res;
  };

  const register = async (email, password) => {
    const res = await registerUser(email, password);
    setUser(res.user);
    return res;
  };

  const logout = () => {
    logoutUser();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        darkMode,
        toggleDarkMode,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
