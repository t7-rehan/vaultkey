import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { getActivityLogs } from '../services/activityService';
import { EmptyState } from '../components/common/EmptyState';
import { Activity, CheckCircle2, XCircle, ShieldX, Clock, Download, Lock, Key } from 'lucide-react';

export function ActivityPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await getActivityLogs();
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getEventBadge = (event, status) => {
    let colorClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
    let icon = <CheckCircle2 className="w-3.5 h-3.5" />;

    if (status === 'DENIED' || status === 'FAILED' || event.includes('DENIED') || event.includes('FAILED')) {
      colorClass = "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400";
      icon = <XCircle className="w-3.5 h-3.5" />;
    } else if (event === 'LINK_REVOKED') {
      colorClass = "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
      icon = <ShieldX className="w-3.5 h-3.5" />;
    } else if (event === 'FILE_DOWNLOADED') {
      colorClass = "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400";
      icon = <Download className="w-3.5 h-3.5" />;
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold ${colorClass}`}>
        {icon}
        <span>{event}</span>
      </span>
    );
  };

  return (
    <AppShell
      title="Security Activity"
      subtitle="Monitor access events and security history across all your shared files."
    >
      <div className="bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-6 shadow-sm">
        {loading ? (
          <div className="py-12 flex justify-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No security activity yet"
            description="Activity logs from your shared files will appear here chronologically."
          />
        ) : (
          <div className="divide-y divide-[#E6EAF0] dark:divide-[#253044]">
            {logs.map((log) => (
              <div
                key={log.id}
                className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-gray-50/50 dark:hover:bg-surface-darkSecondary/30 px-3 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {getEventBadge(log.event, log.status)}
                  <div className="min-w-0">
                    <span className="font-semibold text-sm text-gray-900 dark:text-white block truncate">
                      {log.filename || 'VaultKey File'}
                    </span>
                    {log.user_agent && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate block max-w-md mt-0.5">
                        {log.user_agent}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-gray-400 dark:text-gray-500 shrink-0 font-medium">
                  {new Date(log.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
