import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, FileText, Lock, Clock, Hash, Download, CheckCircle2, AlertCircle, Eye, EyeOff, X } from 'lucide-react';
import { checkRecipientAccess, downloadEncryptedFile } from '../services/accessService';
import { extractKeyFromFragment } from '../crypto/keyManager';
import { decryptFile } from '../crypto/decrypt';
import { Button } from '../components/common/Button';
import { ErrorState } from '../components/common/ErrorState';
import { StatusBadge } from '../components/common/StatusBadge';

export function ShareRecipientPage() {
  const { token } = useParams();
  const [accessData, setAccessData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [viewBlobUrl, setViewBlobUrl] = useState(null);
  const [showViewer, setShowViewer] = useState(false);

  const fetchAccessState = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await checkRecipientAccess(token);
      setAccessData(data);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Failed to contact VaultKey server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAccessState();
    }
  }, [token]);

  const handleAccessAndDownload = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    // Extract decryption key from zero-knowledge URL fragment
    const keyHex = extractKeyFromFragment(window.location.hash);
    if (!keyHex) {
      setErrorMsg("Missing decryption key fragment in URL. Unable to decrypt.");
      return;
    }

    setDownloading(true);

    try {
      // 1. Fetch ciphertext from backend (server-side authorization)
      const { arrayBuffer, ivHex, originalFilename } = await downloadEncryptedFile(token, password);

      // 2. Decrypt locally in browser using Web Crypto API
      const decryptedBlob = await decryptFile(arrayBuffer, ivHex, keyHex);

      // 3. Handle View-Only vs Download
      if (accessData?.max_downloads === 0) {
        // View-only mode: Render inside browser viewer without triggering save-to-disk
        const blobUrl = URL.createObjectURL(decryptedBlob);
        setViewBlobUrl(blobUrl);
        setShowViewer(true);
      } else {
        // Standard mode: Trigger browser download
        const blobUrl = URL.createObjectURL(decryptedBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = originalFilename || 'document.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        setDownloadComplete(true);
      }

      fetchAccessState(); // Refresh remaining counter
    } catch (err) {
      console.error("Recipient download error:", err);
      setErrorMsg(err.message || "Unable to authorize access or decrypt file.");
    } finally {
      setDownloading(false);
    }
  };

  const handleCloseViewer = () => {
    if (viewBlobUrl) {
      URL.revokeObjectURL(viewBlobUrl);
      setViewBlobUrl(null);
    }
    setShowViewer(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#080D18] flex flex-col justify-center items-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  if (!accessData || !accessData.valid) {
    const status = accessData?.status || 'INVALID';
    if (status === 'REVOKED') {
      return (
        <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#080D18] flex flex-col justify-center items-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-8 shadow-xl">
            <ErrorState
              type="REVOKED"
              title="Access revoked"
              message="This VaultKey link has been revoked by its owner."
            />
          </div>
        </div>
      );
    }
    if (status === 'EXPIRED') {
      return (
        <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#080D18] flex flex-col justify-center items-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-8 shadow-xl">
            <ErrorState
              type="EXPIRED"
              title="Link expired"
              message="This VaultKey link is no longer available."
            />
          </div>
        </div>
      );
    }
    if (status === 'LIMIT_REACHED') {
      return (
        <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#080D18] flex flex-col justify-center items-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-8 shadow-xl">
            <ErrorState
              type="LIMIT_REACHED"
              title="Download limit reached"
              message="The maximum number of downloads for this file has been reached."
            />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#080D18] flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-8 shadow-xl">
          <ErrorState
            type="INVALID"
            title="Invalid link"
            message="This VaultKey link is invalid or does not exist."
          />
        </div>
      </div>
    );
  }

  const isViewOnly = accessData.max_downloads === 0;

  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#080D18] flex flex-col justify-center items-center p-4">
      {/* View-Only Secure In-Browser Document Viewer Modal */}
      {showViewer && viewBlobUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col p-4 md:p-6 animate-fade-in">
          <div className="flex items-center justify-between bg-surface-dark border border-[#253044] px-5 py-3.5 rounded-xl mb-4 text-white">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
                <EyeOff className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-white">
                  {accessData.original_filename}
                </h3>
                <p className="text-xs text-amber-400 font-medium flex items-center gap-1.5">
                  <span>🔒 View-Only Mode — Local download & save disabled</span>
                </p>
              </div>
            </div>
            <button
              onClick={handleCloseViewer}
              className="p-2 bg-surface-darkSecondary hover:bg-gray-800 rounded-xl text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div
            className="flex-1 w-full bg-surface-darkSecondary border border-[#253044] rounded-2xl overflow-hidden shadow-2xl relative"
            onContextMenu={(e) => e.preventDefault()}
          >
            <iframe
              src={`${viewBlobUrl}#toolbar=0&navpanes=0`}
              title="Secure View Only Document"
              className="w-full h-full border-0 select-none"
            />
          </div>
        </div>
      )}

      <div className="w-full max-w-md bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-8 shadow-xl">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-brand-500 flex items-center justify-center text-white shadow-lg shadow-brand-500/25 mb-3">
            <Shield className="w-7 h-7 stroke-[2.5]" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Secure File Available
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {isViewOnly ? 'Client-side encrypted payload ready for in-browser view.' : 'Client-side encrypted payload ready for retrieval.'}
          </p>
        </div>

        {/* File Card */}
        <div className="p-4 bg-gray-50 dark:bg-surface-darkSecondary border border-[#E6EAF0] dark:border-[#253044] rounded-xl mb-6">
          <div className="flex items-center gap-3.5 mb-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-sm text-gray-900 dark:text-white block truncate">
                {accessData.original_filename}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {(accessData.file_size / (1024 * 1024)).toFixed(2)} MB · PDF Document
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#E6EAF0] dark:border-[#253044] text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span>
                {accessData.expires_at ? `Expires ${new Date(accessData.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'No Expiration'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-gray-400" />
              <span>{isViewOnly ? 'View Only (0 Downloads)' : `Downloads left: ${accessData.downloads_remaining}`}</span>
            </div>
          </div>
        </div>

        {/* View Only Security Banner */}
        {isViewOnly && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 rounded-xl text-xs border border-amber-200 dark:border-amber-800/50 mb-4 flex items-center gap-2">
            <EyeOff className="w-4 h-4 shrink-0 text-amber-500" />
            <span>🔒 <strong>View-Only Mode Enabled</strong>: You can read this document inside your browser window, but local saving and downloading are disabled.</span>
          </div>
        )}

        {/* Error message if any */}
        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 rounded-xl text-xs border border-rose-200 dark:border-rose-800/50 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Download / View Form */}
        <form onSubmit={handleAccessAndDownload} className="space-y-4">
          {accessData.requires_password && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-gray-400" />
                <span>Password Required</span>
              </label>
              <input
                type="password"
                required
                placeholder="Enter access password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={downloading}
            icon={isViewOnly ? Eye : (downloadComplete ? CheckCircle2 : Download)}
          >
            {isViewOnly ? 'VIEW DOCUMENT IN BROWSER' : (downloadComplete ? 'DOWNLOAD AGAIN' : 'ACCESS FILE')}
          </Button>
        </form>

        {/* Security Declaration */}
        <div className="mt-6 text-center">
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            VaultKey client-side decryption occurs in your browser.
          </p>
        </div>
      </div>
    </div>
  );
}

