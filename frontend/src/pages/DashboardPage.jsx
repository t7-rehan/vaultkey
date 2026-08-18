import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { useAuth } from '../context/AuthContext';
import { getFiles, deleteFile } from '../services/fileService';
import { getUserShares, revokeShareLink } from '../services/shareService';
import { Button } from '../components/common/Button';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { UploadModal } from '../components/upload/UploadModal';
import { CreateShareModal } from '../components/shares/CreateShareModal';
import { ShareSuccessModal } from '../components/shares/ShareSuccessModal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { FileText, Shield, Link2, Download, AlertOctagon, Eye, Plus, Trash2, ArrowRight } from 'lucide-react';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [files, setFiles] = useState([]);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [shareFileTarget, setShareFileTarget] = useState(null); // { file, keyHex }
  const [shareSuccessData, setShareSuccessData] = useState(null);
  const [revokeShareTarget, setRevokeShareTarget] = useState(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [filesList, sharesList] = await Promise.all([
        getFiles(),
        getUserShares()
      ]);
      setFiles(filesList);
      setShares(sharesList);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Calculate metrics
  const activeLinksCount = shares.filter(s => s.status === 'ACTIVE').length;
  const totalDownloadsCount = shares.reduce((acc, s) => acc + s.download_count, 0);
  const revokedLinksCount = shares.filter(s => s.revoked).length;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const username = user?.email ? user.email.split('@')[0] : 'Alice';
  const formattedUsername = username.charAt(0).toUpperCase() + username.slice(1);

  const handleUploadSuccess = (uploadedFile, keyHex) => {
    fetchDashboardData();
    // Open create share link modal immediately after upload
    setShareFileTarget({ file: uploadedFile, keyHex });
  };

  const handleRevokeConfirm = async () => {
    if (!revokeShareTarget) return;
    setRevokeLoading(true);
    try {
      await revokeShareLink(revokeShareTarget.id);
      await fetchDashboardData();
      setRevokeShareTarget(null);
    } catch (err) {
      console.error("Revoke error:", err);
    } finally {
      setRevokeLoading(false);
    }
  };

  return (
    <AppShell
      title={`${getGreeting()}, ${formattedUsername}`}
      subtitle="Your secure files · Everything you've shared is controlled from here."
      onUploadClick={() => setIsUploadOpen(true)}
    >
      <div className="space-y-8">
        {/* Compact Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Files</span>
              <div className="p-2 bg-blue-50 dark:bg-brand-500/10 text-brand-500 rounded-xl">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{files.length}</div>
          </div>

          <div className="bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Links</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-xl">
                <Link2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{activeLinksCount}</div>
          </div>

          <div className="bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Downloads</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 rounded-xl">
                <Download className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalDownloadsCount}</div>
          </div>

          <div className="bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Revoked</span>
              <div className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-xl">
                <AlertOctagon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{revokedLinksCount}</div>
          </div>
        </div>

        {/* Files Section */}
        <div className="bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">Your Files</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Manage access controls and audit activities.</p>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
            </div>
          ) : files.length === 0 ? (
            <EmptyState
              title="Your vault is empty"
              description="Upload a PDF file to encrypt it in your browser and create your first secure share link."
              actionText="UPLOAD PDF"
              onAction={() => setIsUploadOpen(true)}
            />
          ) : (
            <div className="divide-y divide-[#E6EAF0] dark:divide-[#253044]">
              {files.map((file) => {
                // Find most recent share for this file
                const fileShares = shares.filter(s => s.file_id === file.id);
                const activeShare = fileShares.find(s => s.status === 'ACTIVE');
                const latestShare = fileShares[0];

                return (
                  <div
                    key={file.id}
                    className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-gray-50/50 dark:hover:bg-surface-darkSecondary/30 px-3 rounded-xl transition-colors"
                  >
                    {/* Left: Icon & File Info */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            onClick={() => navigate(`/files/${file.id}`)}
                            className="font-semibold text-sm text-gray-900 dark:text-white hover:text-brand-500 dark:hover:text-brand-400 cursor-pointer truncate"
                          >
                            {file.original_filename}
                          </span>
                          <StatusBadge status="ENCRYPTED" />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                          <span>·</span>
                          <span>Uploaded {new Date(file.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Share Status */}
                    <div className="flex items-center gap-4 text-xs">
                      {latestShare ? (
                        <div className="flex items-center gap-3">
                          <StatusBadge status={latestShare.status} />
                          <span className="text-gray-500 dark:text-gray-400 font-medium">
                            Downloads {latestShare.download_count}/{latestShare.max_downloads}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-xs italic">
                          No active share link
                        </span>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={Eye}
                        onClick={() => navigate(`/files/${file.id}`)}
                      >
                        VIEW
                      </Button>

                      {activeShare ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setRevokeShareTarget(activeShare)}
                        >
                          REVOKE
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Link2}
                          onClick={() => {
                            // Prompt to re-key or generate new link
                            setShareFileTarget({ file, keyHex: 'GENERATED_NEW' });
                          }}
                        >
                          CREATE LINK
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={handleUploadSuccess}
      />

      {shareFileTarget && (
        <CreateShareModal
          isOpen={!!shareFileTarget}
          onClose={() => setShareFileTarget(null)}
          fileItem={shareFileTarget.file}
          keyHex={shareFileTarget.keyHex}
          onShareCreated={(shareData) => {
            fetchDashboardData();
            setShareSuccessData(shareData);
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
