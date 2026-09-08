import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import {
  Shield, Clock, Hash, Lock, Link as LinkIcon, Key, AlertCircle,
  Download, EyeOff,
} from 'lucide-react';
import { createShareLink } from '../../services/shareService';
import { buildShareUrl } from '../../crypto/keyManager';

export function CreateShareModal({ isOpen, onClose, fileItem, keyHex, onShareCreated }) {
  const [expirationHours, setExpirationHours] = useState(24);
  const [accessMode, setAccessMode] = useState('download'); // 'download' | 'view_only'
  const [maxDownloads, setMaxDownloads] = useState(5);
  const [enablePassword, setEnablePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [manualKeyHex, setManualKeyHex] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Determine effective key: use prop if present, else fall back to manual input
  const effectiveKey = keyHex || manualKeyHex.trim();
  const needsKeyInput = !keyHex;

  const isViewOnly = accessMode === 'view_only';

  if (!fileItem) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (enablePassword && (!password || password.trim().length < 4)) {
        throw new Error("Password must be at least 4 characters.");
      }

      if (!effectiveKey || effectiveKey.length !== 64) {
        throw new Error("A valid 64-character hex encryption key is required to build the share URL.");
      }

      const res = await createShareLink(
        fileItem.id,
        expirationHours,
        // VIEW_ONLY shares use max_downloads=0 as the legacy signal too;
        // the explicit access_mode field is the authoritative control.
        isViewOnly ? 0 : maxDownloads,
        enablePassword ? password.trim() : null,
        accessMode,
      );

      const shareUrl = buildShareUrl(res.token, effectiveKey);

      onShareCreated({ ...res, shareUrl });
      onClose();
    } catch (err) {
      setError(err.message || "Could not generate share link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Secure Link"
      subtitle="Configure server-side access controls for your encrypted file."
    >
      <form onSubmit={handleCreate} className="space-y-5">
        {/* Selected File Summary Card */}
        <div className="p-3.5 bg-gray-50 dark:bg-surface-darkSecondary rounded-xl border border-[#E6EAF0] dark:border-[#253044] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-50 text-brand-500 dark:bg-brand-500/10 rounded-lg">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {fileItem.original_filename}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(fileItem.size / (1024 * 1024)).toFixed(2)} MB · Client-side encrypted
              </p>
            </div>
          </div>
        </div>

        {/* Key Input for re-sharing existing files */}
        {needsKeyInput && (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <strong>Encryption key required.</strong> VaultKey never stores your key. Paste the original 64-character hex key for this file to generate a new share link.
                </p>
                <p className="text-xs text-amber-800 dark:text-amber-300 font-semibold">
                  ⚠️ If you lost the key, this file cannot be decrypted or shared — including by you.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Key className="w-4 h-4 text-amber-500 shrink-0" />
              <input
                type="text"
                placeholder="Paste 64-char hex key here..."
                value={manualKeyHex}
                onChange={(e) => setManualKeyHex(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs font-mono bg-white dark:bg-surface-dark border border-amber-300 dark:border-amber-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>
        )}

        {/* Access Mode Toggle */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Access Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            {/* DOWNLOAD option */}
            <button
              type="button"
              onClick={() => setAccessMode('download')}
              className={`flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-colors ${
                !isViewOnly
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300'
                  : 'border-[#E6EAF0] dark:border-[#253044] text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-[#3a4d6a]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">Download</span>
              </div>
              <p className="text-[11px] leading-tight opacity-80">
                Recipient can save the file to their device.
              </p>
            </button>

            {/* VIEW ONLY option */}
            <button
              type="button"
              onClick={() => setAccessMode('view_only')}
              className={`flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-colors ${
                isViewOnly
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'border-[#E6EAF0] dark:border-[#253044] text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-[#3a4d6a]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <EyeOff className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold">View Only</span>
              </div>
              <p className="text-[11px] leading-tight opacity-80">
                In-browser viewer only. Download &amp; print are disabled.
              </p>
            </button>
          </div>

          {isViewOnly && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 flex items-start gap-1.5">
              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                View-Only enforces browser-side deterrents and server-side download rejection.
                It does not prevent screenshots or memory inspection on the recipient's device.
              </span>
            </p>
          )}
        </div>

        {/* Expiration Dropdown */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <span>Link Expiration</span>
          </label>
          <select
            value={expirationHours}
            onChange={(e) => setExpirationHours(Number(e.target.value))}
            className="w-full px-3.5 py-2 text-sm bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value={1}>1 hour</option>
            <option value={6}>6 hours</option>
            <option value={24}>24 hours (Recommended)</option>
            <option value={72}>3 days</option>
            <option value={168}>7 days (Maximum)</option>
          </select>
        </div>

        {/* Download Limit — hidden for VIEW_ONLY */}
        {!isViewOnly && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-gray-400" />
              <span>Maximum Download Limit</span>
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={maxDownloads}
              onChange={(e) => setMaxDownloads(Math.min(10, Math.max(1, Number(e.target.value))))}
              className="w-full px-3.5 py-2 text-sm bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              Server enforces atomic counter protection up to 10 downloads.
            </p>
          </div>
        )}

        {/* Password Protection Toggle */}
        <div className="pt-2 border-t border-[#E6EAF0] dark:border-[#253044]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-gray-400" />
              <div>
                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                  Password Protection
                </span>
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Require recipients to enter a password before viewing.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEnablePassword(!enablePassword)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 ${
                enablePassword ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                  enablePassword ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {enablePassword && (
            <div className="mt-3">
              <input
                type="password"
                placeholder="Enter access password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading} icon={LinkIcon}>
            CREATE LINK
          </Button>
        </div>
      </form>
    </Modal>
  );
}
