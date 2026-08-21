import React, { useState, useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { getActivityLogs } from '../services/activityService';
import { EmptyState } from '../components/common/EmptyState';
import { parseUserAgent, formatIpAddress } from '../utils/useragentParser';
import { Activity, CheckCircle2, XCircle, ShieldX, Clock, Download, Eye, Globe, Laptop, Smartphone, FileText } from 'lucide-react';

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
    let colorClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50";
    let icon = <CheckCircle2 className="w-3.5 h-3.5" />;

    if (status === 'DENIED' || status === 'FAILED' || event.includes('DENIED') || event.includes('FAILED')) {
      colorClass = "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-800/50";
      icon = <XCircle className="w-3.5 h-3.5" />;
    } else if (event === 'LINK_REVOKED') {
      colorClass = "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-800/50";
      icon = <ShieldX className="w-3.5 h-3.5" />;
    } else if (event === 'FILE_DOWNLOADED') {
      colorClass = "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50";
      icon = <Download className="w-3.5 h-3.5" />;
    } else if (event === 'FILE_VIEWED') {
      colorClass = "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border-sky-200 dark:border-sky-800/50";
      icon = <Eye className="w-3.5 h-3.5" />;
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${colorClass}`}>
        {icon}
        <span>{event}</span>
      </span>
    );
  };

  return (
    <AppShell
      title="Access Audit Log"
      subtitle="Complete chronological audit trail showing who accessed your files, timestamps, devices, IP addresses, and security statuses."
    >
      <div className="bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-6 shadow-sm">
        {loading ? (
          <div className="py-12 flex justify-center text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No audit logs recorded yet"
            description="Access activity across all your shared VaultKey links will appear here automatically."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E6EAF0] dark:border-[#253044] text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  <th className="py-3 px-3">Event & Status</th>
                  <th className="py-3 px-3">Target File</th>
                  <th className="py-3 px-3">Device / Browser</th>
                  <th className="py-3 px-3">IP Address</th>
                  <th className="py-3 px-3 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6EAF0] dark:divide-[#253044] text-xs">
                {logs.map((log) => {
                  const parsedUA = parseUserAgent(log.user_agent);
                  const formattedIp = formatIpAddress(log.ip_address);
                  const isMobile = parsedUA.deviceType === 'mobile';

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-gray-50/60 dark:hover:bg-surface-darkSecondary/40 transition-colors"
                    >
                      {/* Event Badge */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {getEventBadge(log.event, log.status)}
                      </td>

                      {/* File Name */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2 max-w-xs">
                          <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="font-semibold text-gray-900 dark:text-white truncate">
                            {log.filename || 'VaultKey File'}
                          </span>
                        </div>
                      </td>

                      {/* Device / Browser */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                          {isMobile ? (
                            <Smartphone className="w-4 h-4 text-brand-500 shrink-0" />
                          ) : (
                            <Laptop className="w-4 h-4 text-gray-400 shrink-0" />
                          )}
                          <span className="font-medium truncate max-w-[200px]" title={log.user_agent}>
                            {parsedUA.full}
                          </span>
                        </div>
                      </td>

                      {/* IP Address */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 font-mono text-[11px]">
                          <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span>{formattedIp}</span>
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3.5 px-3 text-right text-gray-500 dark:text-gray-400 whitespace-nowrap font-medium">
                        {new Date(log.timestamp).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}

