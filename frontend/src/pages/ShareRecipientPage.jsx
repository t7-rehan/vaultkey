import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Shield, FileText, Lock, Clock, Hash,
  Download, CheckCircle2, AlertCircle, Eye, EyeOff,
} from 'lucide-react';
import {
  checkRecipientAccess,
  downloadEncryptedFile,
  viewEncryptedFile,
  reportBlockedAction,
} from '../services/accessService';
import { extractKeyFromFragment } from '../crypto/keyManager';
import { decryptFile } from '../crypto/decrypt';
import { Button } from '../components/common/Button';
import { ErrorState } from '../components/common/ErrorState';
import { ViewOnlyViewer } from '../components/shares/ViewOnlyViewer';

export function ShareRecipientPage() {
  const { token } = useParams();

  const [accessData, setAccessData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // View-only viewer state
  const [viewerBlob, setViewerBlob] = useState(null);   // Blob – decrypted content
  const [viewerFilename, setViewerFilename] = useState('');
  const [viewerMime, setViewerMime] = useState('');
  const [showViewer, setShowViewer] = useState(false);

  // ── Fetch share metadata ──────────────────────────────────────────────────
  const fetchAccessState = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await checkRecipientAccess(token);
      setAccessData(data);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to contact VaultKey server.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchAccessState();
  }, [token, fetchAccessState]);

  // ── Derived flags ─────────────────────────────────────────────────────────
  const isViewOnly = accessData?.access_mode === 'view_only';

  // ── Main action handler ───────────────────────────────────────────────────
  const handleAccess = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    // Key lives only in the URL fragment — never sent to the server.
    const keyHex = extractKeyFromFragment(window.location.hash);
    if (!keyHex) {
      setErrorMsg('Missing decryption key fragment in URL. Unable to decrypt.');
      return;
    }

    setBusy(true);
    try {
      let arrayBuffer, ivHex, originalFilename, mimeType;

      if (isViewOnly) {
        // VIEW_ONLY: use the dedicated /view endpoint which logs VIEW_STARTED
        // and never increments the download counter.
        ({ arrayBuffer, ivHex, originalFilename, mimeType } =
          await viewEncryptedFile(token, password));
      } else {
        // DOWNLOAD: use the /download endpoint as before.
        ({ arrayBuffer, ivHex, originalFilename, mimeType } =
          await downloadEncryptedFile(token, password));
      }

      // Decrypt locally using Web Crypto API — key never leaves the browser.
      const decryptedBlob = await decryptFile(
        arrayBuffer,
        ivHex,
        keyHex,
        mimeType,
        originalFilename,
      );

      if (isViewOnly) {
        // Hand the blob to the controlled viewer.
        // The blob URL is created and revoked inside ViewOnlyViewer.
        setViewerBlob(decryptedBlob);
        setViewerFilename(originalFilename);
        setViewerMime(mimeType || '');
        setShowViewer(true);
      } else {
        // Standard download: create a temporary anchor, click, revoke immediately.
        const blobUrl = URL.createObjectURL(decryptedBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = originalFilename || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        setDownloadComplete(true);
        fetchAccessState(); // refresh remaining counter
      }
    } catch (err) {
      console.error('Recipient access error:', err);
      setErrorMsg(err.message || 'Unable to authorize access or decrypt file.');
    } finally {
      setBusy(false);
    }
  };

  // ── Viewer close ──────────────────────────────────────────────────────────
  const handleViewerClose = useCallback(() => {
    // Blob URL is revoked inside ViewOnlyViewer on unmount — just clear state.
    setShowViewer(false);
    setViewerBlob(null);
    // Report VIEW_COMPLETED to the backend audit log (fire-and-forget).
    reportBlockedAction(token, 'VIEW_COMPLETED');
  }, [token]);

  // ── Viewer blocked-action callback ────────────────────────────────────────
  const handleBlockedAction = useCallback(
    (event) => {
      // Forward the blocked-action event to the backend audit log.
      // reportBlockedAction is fire-and-forget; errors are swallowed inside it.
      reportBlockedAction(token, event);
    },
    [token],
  );

  // ── Loading spinner ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#080D18] flex flex-col justify-center items-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </div>
    );
  }

  // ── Error / invalid states ────────────────────────────────────────────────
  if (!accessData || !accessData.valid) {
    const statusCode = accessData?.status || 'INVALID';

    const errorConfig = {
      REVOKED:       { type: 'REVOKED',       title: 'Access revoked',          message: 'This VaultKey link has been revoked by its owner.' },
      EXPIRED:       { type: 'EXPIRED',       title: 'Link expired',             message: 'This VaultKey link is no longer available.' },
      LIMIT_REACHED: { type: 'LIMIT_REACHED', title: 'Download limit reached',   message: 'The maximum number of downloads for this file has been reached.' },
      INVALID:       { type: 'INVALID',       title: 'Invalid link',             message: 'This VaultKey link is invalid or does not exist.' },
    };
    const cfg = errorConfig[statusCode] ?? errorConfig['INVALID'];

    return (
      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#080D18] flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-2xl p-8 shadow-xl">
          <ErrorState type={cfg.type} title={cfg.title} message={cfg.message} />
        </div>
      </div>
    );
  }

  // ── View-Only viewer overlay ──────────────────────────────────────────────
  // Rendered outside the card so it can occupy the full viewport.
  const viewerOverlay =
    showViewer && viewerBlob ? (
      <ViewOnlyViewer
        decryptedBlob={viewerBlob}
        filename={viewerFilename}
        mimeType={viewerMime}
        onClose={handleViewerClose}
        onBlockedAction={handleBlockedAction}
      />
    ) : null;

  // ── Main access card ──────────────────────────────────────────────────────
  return (
    <>
      {viewerOverlay}

      <div className="min-h-screen bg-[#F7F9FC] dark:bg-[#080D18] flex flex-col justify-center items-center p-4">
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
              {isViewOnly
                ? 'Client-side encrypted payload ready for in-browser view.'
                : 'Client-side encrypted payload ready for retrieval.'}
            </p>
          </div>

          {/* File info card */}
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
                  {(accessData.file_size / (1024 * 1024)).toFixed(2)} MB
                  {' · '}
                  {accessData.original_filename?.split('.').pop()?.toUpperCase() ?? 'File'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#E6EAF0] dark:border-[#253044] text-xs text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <span>
                  {accessData.expires_at
                    ? `Expires ${new Date(accessData.expires_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : 'No Expiration'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-gray-400" />
                <span>
                  {isViewOnly
                    ? 'View Only'
                    : `Downloads left: ${accessData.downloads_remaining}`}
                </span>
              </div>
            </div>
          </div>

          {/* View-Only banner */}
          {isViewOnly && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 rounded-xl text-xs border border-amber-200 dark:border-amber-800/50 mb-4 flex items-start gap-2">
              <EyeOff className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
              <span>
                <strong>View-Only Mode</strong> — You can read this document inside
                your browser. Downloading and printing are disabled for this share.
              </span>
            </div>
          )}

          {/* Error message */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 rounded-xl text-xs border border-rose-200 dark:border-rose-800/50 mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Access form */}
          <form onSubmit={handleAccess} className="space-y-4">
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
              loading={busy}
              icon={
                isViewOnly
                  ? Eye
                  : downloadComplete
                  ? CheckCircle2
                  : Download
              }
            >
              {isViewOnly
                ? 'VIEW DOCUMENT IN BROWSER'
                : downloadComplete
                ? 'DOWNLOAD AGAIN'
                : 'ACCESS FILE'}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              VaultKey client-side decryption occurs in your browser.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
