import React from 'react';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { User, Sun, Moon, Shield, Lock, EyeOff } from 'lucide-react';

export function SettingsPage() {
  const { user, darkMode, toggleDarkMode } = useAuth();

  return (
    <AppShell title="Settings" subtitle="Account details, appearance, and privacy settings.">
      <div className="space-y-6 max-w-3xl">
        {/* Account Section */}
        <div className="bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#E6EAF0] dark:border-[#253044]">
            <User className="w-5 h-5 text-brand-500" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Account</h3>
          </div>
          <div className="space-y-3">
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500 block">Authenticated Email</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white font-mono">
                {user?.email}
              </span>
            </div>
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500 block">Account ID</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {user?.id}
              </span>
            </div>
          </div>
        </div>

        {/* Appearance Section */}
        <div className="bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#E6EAF0] dark:border-[#253044]">
            {darkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Appearance</h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-gray-900 dark:text-white block">Theme Mode</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">Switch between calm light and dark interface themes.</span>
            </div>
            <button
              onClick={toggleDarkMode}
              className="px-4 py-2 bg-gray-100 dark:bg-surface-darkSecondary hover:bg-gray-200 dark:hover:bg-gray-800 text-xs font-semibold text-gray-800 dark:text-gray-200 rounded-xl transition-colors"
            >
              {darkMode ? 'Switch to Light' : 'Switch to Dark'}
            </button>
          </div>
        </div>

        {/* Security & Privacy Declaration */}
        <div className="bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#E6EAF0] dark:border-[#253044]">
            <Shield className="w-5 h-5 text-brand-500" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Privacy & Cryptography Architecture</h3>
          </div>
          <div className="space-y-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
            <div className="flex items-start gap-2.5 p-3 bg-blue-50/50 dark:bg-brand-500/10 rounded-xl border border-blue-100 dark:border-brand-500/20">
              <EyeOff className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
              <span>
                <strong>Zero-Knowledge Key Fragments:</strong> Encryption keys are kept solely in the browser's URL fragment (`#key=...`). URL fragments are never sent over HTTP to the backend server.
              </span>
            </div>

            <div className="flex items-start gap-2.5 p-3 bg-gray-50 dark:bg-surface-darkSecondary rounded-xl">
              <Lock className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <span>
                <strong>Data Minimization:</strong> VaultKey stores only the necessary metadata (token hash, expiration, download count) to enforce server-side access controls and remote revocation.
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
