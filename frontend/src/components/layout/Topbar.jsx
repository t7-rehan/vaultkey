import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../common/Button';

export function Topbar({ title, subtitle, onUploadClick }) {
  return (
    <header className="h-20 border-b border-[#E6EAF0] dark:border-[#253044] bg-white/80 dark:bg-surface-dark/80 backdrop-blur-md sticky top-0 z-20 px-8 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
        )}
      </div>

      {onUploadClick && (
        <Button variant="primary" icon={Plus} onClick={onUploadClick}>
          Upload PDF
        </Button>
      )}
    </header>
  );
}
