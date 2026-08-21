import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Shield, LayoutDashboard, Files, Activity, Settings, LogOut, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function Sidebar() {
  const { user, logout, darkMode, toggleDarkMode } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Files', icon: Files, path: '/files' },
    { label: 'Activity', icon: Activity, path: '/activity' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-60 bg-white dark:bg-surface-dark border-r border-[#E6EAF0] dark:border-[#253044] flex flex-col justify-between h-screen sticky top-0 z-30 select-none">
      <div>
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 border-b border-[#E6EAF0] dark:border-[#253044]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center text-white shadow-md shadow-brand-500/20">
              <Shield className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight text-gray-900 dark:text-white">VaultKey</span>
              <span className="text-[10px] font-semibold tracking-wider text-brand-500 uppercase">Privacy First</span>
            </div>
          </div>
        </div>

        {/* Primary Navigation */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-500 font-semibold'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-surface-darkSecondary hover:text-gray-900 dark:hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-brand-500' : 'text-gray-400 dark:text-gray-500'}`} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom Controls & User Info */}
      <div className="p-4 space-y-2 border-t border-[#E6EAF0] dark:border-[#253044]">
        {/* Dark mode toggle */}
        <button
          onClick={toggleDarkMode}
          className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-surface-darkSecondary transition-colors"
        >
          <span className="flex items-center gap-2.5">
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
            <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </span>
        </button>

        {/* Settings */}
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors ${
              isActive
                ? 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-500'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-surface-darkSecondary hover:text-gray-900 dark:hover:text-white'
            }`
          }
        >
          <Settings className="w-4 h-4 text-gray-400" />
          <span>Settings</span>
        </NavLink>

        {/* User Account / Logout */}
        <div className="pt-2 border-t border-[#E6EAF0] dark:border-[#253044] flex items-center justify-between px-2">
          <div className="flex flex-col truncate max-w-[130px]">
            <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">
              {user?.email?.split('@')[0] || 'User'}
            </span>
            <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
              {user?.email}
            </span>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
