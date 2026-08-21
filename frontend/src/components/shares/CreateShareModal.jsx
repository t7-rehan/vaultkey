import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Shield, Clock, Hash, Lock, Link as LinkIcon } from 'lucide-react';
import { createShareLink } from '../../services/shareService';
import { buildShareUrl } from '../../crypto/keyManager';

export function CreateShareModal({ isOpen, onClose, fileItem, keyHex, onShareCreated }) {
  const [expirationHours, setExpirationHours] = useState(24); // 24 hours default
  const [maxDownloads, setMaxDownloads] = useState(5);
  const [enablePassword, setEnablePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!fileItem) return null;

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (enablePassword && (!password || password.trim().length < 4)) {
        throw new Error("Password must be at least 4 characters.");
      }

      const res = await createShareLink(
        fileItem.id,
        expirationHours,
        maxDownloads,
        enablePassword ? password.trim() : null
      );

      // Construct zero-knowledge fragment share link using raw token & client keyHex
      const shareUrl = buildShareUrl(res.token, keyHex);

      onShareCreated({
        ...res,
        shareUrl,
      });

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

        {/* Download Limit */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-gray-400" />
            <span>Maximum Download Limit</span>
          </label>
          <input
            type="number"
            min={0}
            max={10}
            value={maxDownloads}
            onChange={(e) => setMaxDownloads(Math.min(10, Math.max(0, Number(e.target.value))))}
            className="w-full px-3.5 py-2 text-sm bg-white dark:bg-surface-dark border border-[#E6EAF0] dark:border-[#253044] rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
            {maxDownloads === 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                🔒 View-Only Mode: Recipient can view document inside browser, local file download is disabled.
              </span>
            ) : (
              'Server enforces atomic counter protection up to 10 downloads. Set to 0 for View-Only mode.'
            )}
          </p>
        </div>


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
                  Require recipients to enter a password before downloading.
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
