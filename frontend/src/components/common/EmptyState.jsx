import React from 'react';
import { Shield, FolderOpen, Activity } from 'lucide-react';
import { Button } from './Button';

export function EmptyState({ icon: Icon = FolderOpen, title, description, actionText, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-[#E6EAF0] dark:border-[#253044] rounded-2xl bg-white/50 dark:bg-surface-dark/50">
      <div className="p-3 bg-brand-50 dark:bg-brand-500/10 text-brand-500 rounded-2xl mb-4">
        <Icon className="w-8 h-8" />
      </div>
      <h4 className="text-base font-semibold text-gray-900 dark:text-white mb-1">{title}</h4>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">{description}</p>
      {actionText && onAction && (
        <Button variant="primary" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
}
