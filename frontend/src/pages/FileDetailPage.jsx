import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { getFileDetail } from '../services/fileService';
import { getUserShares, revokeShareLink } from '../services/shareService';
import { getActivityLogs } from '../services/activityService';
import { Button } from '../components/common/Button';
import { StatusBadge } from '../components/common/StatusBadge';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { CreateShareModal } from '../components/shares/CreateShareModal';
import { ShareSuccessModal } from '../components/shares/ShareSuccessModal';
import { parseUserAgent, formatIpAddress } from '../utils/useragentParser';
import { ArrowLeft, FileText, Shield, Clock, Hash, Lock, Activity, CheckCircle2, XCircle, AlertTriangle, ShieldX, Link2 } from 'lucide-react';


export function FileDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [file, setFile] = useState(null);
  const [shares, setShares] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [shareFileTarget, setShareFileTarget] = useState(null);
  const [shareSuccessData, setShareSuccessData] = useState(null);
  const [revokeShareTarget, setRevokeShareTarget] = useState(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  const fetchDetailData = async () => {
    setLoading(true);
    try {
      const [fileData, sharesList, logsList] = await Promise.all([
        getFileDetail(id),
        getUserShares(id),
        getActivityLogs(id)
      ]);
      setFile(fileData);
      setShares(sharesList);
      setActivities(logsList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchDetailData();
    }
  }, [id]);

  const handleRevokeConfirm = async () => {
    if (!revokeShareTarget) return;
    setRevokeLoading(true);
    try {
      await revokeShareLink(revokeShareTarget.id);
      await fetchDetailData();
      setRevokeShareTarget(null);
    } catch (err) {
      console.error(err);
    } finally {
      setRevokeLoading(false);
    }
  };

  if (loading) {
    return (
      <AppShell title="File Details">
        <div className="py-20 flex justify-center text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
        </div>
      </AppShell>
    );
  }

  if (!file) {
    return (
      <AppShell title="File Not Found">
        <div className="p-8 text-center">
          <p className="text-sm text-gray-500 mb-4">The requested file could not be found.</p>
          <Button variant="secondary" onClick={() => navigate('/files')}>
            Back to Files
          </Button>
        </div>
      </AppShell>
    );
  }

  const latestShare = shares[0];

  const getEventIcon = (event, status) => {
    if (status === 'DENIED' || status === 'FAILED' || event === 'ACCESS_DENIED') {
      return <XCircle className="w-4 h-4 text-rose-500" />;
    }
    if (event === 'LINK_REVOKED') {
      return <ShieldX className="w-4 h-4 text-amber-500" />;
    }
    return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  };

  return (
    <AppShell title={file.original_filename} subtitle="Detailed access status and security timeline.">
      <div className="space-y-6">
        {/* Back Link */}
        <div className="flex items-center justify-between">
          <Link
            to="/files"
            className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Files</span>
          </Link>

          <Button
            variant="outline"
            size="sm"
            icon={Link2}
            onClick={() => setShareFileTarget({ file, keyHex: 'NEW_KEY' })}
          >
            Create New Link
          </Button>
        </div>

        {/* Top Summary Card */}
        <div className="bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-[#E6EAF0] dark:border-[#253044]">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 flex items-center justify-center shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    {file.original_filename}
                  </h2>
                  <StatusBadge status="ENCRYPTED" />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB · Uploaded {new Date(file.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            {latestShare && latestShare.status === 'ACTIVE' && (
              <Button
                variant="danger"
                onClick={() => setRevokeShareTarget(latestShare)}
              >
                REVOKE ACCESS
              </Button>
            )}
          </div>

          {/* Active Share Parameters */}
          {latestShare ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6">
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Status</span>
                <StatusBadge status={latestShare.status} />
              </div>

              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Expires</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {latestShare.expires_at ? new Date(latestShare.expires_at).toLocaleString() : 'No Expiry'}
                </span>
              </div>

              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Downloads</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {latestShare.download_count} / {latestShare.max_downloads}
                </span>
              </div>

              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500 block mb-1">Password</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {latestShare.has_password ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          ) : (
            <div className="pt-6 text-xs text-gray-500 dark:text-gray-400 italic">
              No share links created for this file yet.
            </div>
          )}
        </div>

        {/* Security Activity Timeline */}
        <div className="bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-brand-500" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Security Activity Timeline</h3>
          </div>

          {activities.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400">
              No activity recorded for this file yet.
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E6EAF0] dark:before:bg-[#253044]">
              {activities.map((act) => {
                const parsedUA = parseUserAgent(act.user_agent);
                const formattedIp = formatIpAddress(act.ip_address);
                return (
                  <div key={act.id} className="relative flex items-start justify-between text-xs gap-4">
                    <div className="absolute -left-6 top-0.5 bg-white dark:bg-surface-dark p-0.5">
                      {getEventIcon(act.event, act.status)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 dark:text-white font-mono">
                          {act.event}
                        </span>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">
                          ({act.status})
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                        {act.user_agent && (
                          <span>💻 {parsedUA.full}</span>
                        )}
                        <span>🌐 {formattedIp}</span>
                      </div>
                    </div>
                    <span className="text-gray-400 dark:text-gray-500 text-[11px] shrink-0 font-medium">
                      {new Date(act.timestamp).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {shareFileTarget && (
        <CreateShareModal
          isOpen={!!shareFileTarget}
          onClose={() => setShareFileTarget(null)}
          fileItem={shareFileTarget.file}
          keyHex={shareFileTarget.keyHex}
          onShareCreated={(data) => {
            fetchDetailData();
            setShareSuccessData(data);
          }}
        />
      )}

      {shareSuccessData && (
        <ShareSuccessModal
          isOpen={!!shareSuccessData}
          onClose={() => setShareSuccessData(null)}
          shareData={shareSuccessData}
        />
      )}

      {revokeShareTarget && (
        <ConfirmModal
          isOpen={!!revokeShareTarget}
          onClose={() => setRevokeShareTarget(null)}
          onConfirm={handleRevokeConfirm}
          loading={revokeLoading}
        />
      )}
    </AppShell>
  );
}
