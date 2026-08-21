import React from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell({ title, subtitle, onUploadClick, children }) {
  return (
    <div className="flex min-h-screen bg-[#F7F9FC] dark:bg-[#080D18]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} subtitle={subtitle} onUploadClick={onUploadClick} />
        <main className="flex-1 p-8 max-w-6xl w-full mx-auto animate-in fade-in duration-200">
          {children}
        </main>
      </div>
    </div>
  );
}
