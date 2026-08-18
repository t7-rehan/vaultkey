import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { getFiles, deleteFile } from '../services/fileService';
import { Button } from '../components/common/Button';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { UploadModal } from '../components/upload/UploadModal';
import { CreateShareModal } from '../components/shares/CreateShareModal';
import { ShareSuccessModal } from '../components/shares/ShareSuccessModal';
import { FileText, Eye, Link2, Trash2, Search, Plus } from 'lucide-react';

export function FilesPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [shareFileTarget, setShareFileTarget] = useState(null);
  const [shareSuccessData, setShareSuccessData] = useState(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const list = await getFiles();
      setFiles(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleDelete = async (fileId) => {
    if (!window.confirm("Are you sure you want to delete this file and remove all associated share links?")) return;
    try {
      await deleteFile(fileId);
      fetchFiles();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredFiles = files.filter(f =>
    f.original_filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppShell
      title="All Files"
      subtitle="Complete inventory of client-side encrypted documents in your vault."
      onUploadClick={() => setIsUploadOpen(true)}
    >
      <div className="space-y-6">
        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search files by filename..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 text-sm bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* File Table Card */}
        <div className="bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-6 shadow-sm">
          {loading ? (
            <div className="py-12 flex justify-center text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <EmptyState
              title="No files found"
              description="Upload a PDF file to encrypt it locally before sharing."
              actionText="UPLOAD PDF"
              onAction={() => setIsUploadOpen(true)}
            />
          ) : (
            <div className="divide-y divide-[#E6EAF0] dark:divide-[#253044]">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-gray-50/50 dark:hover:bg-surface-darkSecondary/30 px-3 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          onClick={() => navigate(`/files/${file.id}`)}
                          className="font-semibold text-sm text-gray-900 dark:text-white hover:text-brand-500 cursor-pointer truncate"
                        >
                          {file.original_filename}
                        </span>
                        <StatusBadge status="ENCRYPTED" />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                        <span>·</span>
                        <span>Active Shares: {file.active_shares_count}</span>
                        <span>·</span>
                        <span>Downloads: {file.total_downloads}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Eye}
                      onClick={() => navigate(`/files/${file.id}`)}
                    >
                      VIEW
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Link2}
                      onClick={() => setShareFileTarget({ file, keyHex: 'KEY' })}
                    >
                      NEW LINK
                    </Button>
                    <button
                      onClick={() => handleDelete(file.id)}
                      className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                      title="Delete File"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={(fileRecord, keyHex) => {
          fetchFiles();
          setShareFileTarget({ file: fileRecord, keyHex });
        }}
      />

      {shareFileTarget && (
        <CreateShareModal
          isOpen={!!shareFileTarget}
          onClose={() => setShareFileTarget(null)}
          fileItem={shareFileTarget.file}
          keyHex={shareFileTarget.keyHex}
          onShareCreated={(data) => {
            fetchFiles();
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
    </AppShell>
  );
}
