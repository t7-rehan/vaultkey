import React from 'react';
import { AlertCircle, Lock, Clock, ShieldX, FileX, RotateCcw } from 'lucide-react';
import { Button } from './Button';

export function ErrorState({ type, title, message, onRetry, actionText, onAction }) {
  let Icon = AlertCircle;
  let iconBg = "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50";

  switch (type) {
    case 'REVOKED':
      Icon = ShieldX;
      break;
    case 'EXPIRED':
      Icon = Clock;
      break;
    case 'LIMIT_REACHED':
      Icon = Lock;
      break;
    case 'INVALID_FILE':
      Icon = FileX;
      break;
    default:
      Icon = AlertCircle;
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
      <div className={`p-4 rounded-2xl mb-4 ${iconBg}`}>
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{message}</p>
      
      <div className="flex items-center gap-3">
        {onRetry && (
          <Button variant="secondary" icon={RotateCcw} onClick={onRetry}>
            Try Again
          </Button>
        )}
        {actionText && onAction && (
          <Button variant="primary" onClick={onAction}>
            {actionText}
          </Button>
        )}
      </div>
    </div>
  );
}
