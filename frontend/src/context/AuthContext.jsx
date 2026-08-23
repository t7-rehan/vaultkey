import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../config/firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('vaultkey_theme') === 'dark';
  });

  // Dark mode effect — uses localStorage for vaultkey_theme only (not auth)
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('vaultkey_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('vaultkey_theme', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  // Subscribe to Firebase auth state — single source of truth for isAuthenticated
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return unsubscribe; // cleans up listener on unmount
  }, []);

  // Email / password sign-in — propagates Firebase errors to the caller
  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  // Email / password registration — propagates Firebase errors to the caller
  const register = (email, password) => {
    return createUserWithEmailAndPassword(auth, email, password);
  };

  // Sign-out
  const logout = () => {
    return signOut(auth);
  };

  // Google Sign-In via popup — propagates Firebase errors to the caller
  const loginWithGoogle = () => {
    return signInWithPopup(auth, new GoogleAuthProvider());
  };

  // Send email verification to the currently signed-in user
  const sendVerificationEmail = () => {
    return sendEmailVerification(auth.currentUser);
  };

  // Send password-reset email; never reveals whether the address is registered
  const sendPasswordReset = (email) => {
    return sendPasswordResetEmail(auth, email);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        loginWithGoogle,
        sendVerificationEmail,
        sendPasswordReset,
        darkMode,
        toggleDarkMode,
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
