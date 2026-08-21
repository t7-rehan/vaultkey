import React from 'react';
import { CheckCircle2, XCircle, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';

export function StatusBadge({ status }) {
  const normalized = (status || '').toUpperCase();

  switch (normalized) {
    case 'ACTIVE':
    case 'OK':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>ACTIVE</span>
        </span>
      );
    case 'REVOKED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50">
          <XCircle className="w-3.5 h-3.5" />
          <span>REVOKED</span>
        </span>
      );
    case 'EXPIRED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
          <Clock className="w-3.5 h-3.5" />
          <span>EXPIRED</span>
        </span>
      );
    case 'LIMIT_REACHED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>LIMIT REACHED</span>
        </span>
      );
    case 'ENCRYPTED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-500 border border-blue-200 dark:border-brand-500/20">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Encrypted</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {status}
        </span>
      );
  }
}
