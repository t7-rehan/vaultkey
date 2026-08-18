import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Check, Copy, ShieldCheck, Clock, Hash, Lock } from 'lucide-react';

export function ShareSuccessModal({ isOpen, onClose, shareData }) {
  const [copied, setCopied] = useState(false);

  if (!shareData) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareData.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Secure Link Created"
      subtitle="Your zero-knowledge encrypted share link is ready."
    >
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center text-center p-4 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-2">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <span className="font-bold text-base text-gray-900 dark:text-white">
            Ready to Share
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            The decryption key is embedded in the URL fragment and never touches our servers.
          </span>
        </div>

        {/* Share Link Output */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            VaultKey Share URL
          </label>
          <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-surface-darkSecondary border border-[#E6EAF0] dark:border-[#253044] rounded-xl">
            <input
              type="text"
              readOnly
              value={shareData.shareUrl}
              className="flex-1 bg-transparent text-xs font-mono text-gray-800 dark:text-gray-200 px-2 outline-none select-all truncate"
            />
            <Button
              variant="primary"
              size="sm"
              icon={copied ? Check : Copy}
              onClick={handleCopy}
            >
              {copied ? 'COPIED!' : 'COPY LINK'}
            </Button>
          </div>
        </div>

        {/* Share Parameters Summary Grid */}
        <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50/70 dark:bg-surface-darkSecondary/50 rounded-xl border border-[#E6EAF0] dark:border-[#253044] text-xs">
          <div className="flex flex-col">
            <span className="text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Expiration
            </span>
            <span className="font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
              {shareData.expires_at ? new Date(shareData.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '7 days'}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <Hash className="w-3 h-3" /> Limit
            </span>
            <span className="font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
              0 / {shareData.max_downloads}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Password
            </span>
            <span className="font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
              {shareData.has_password ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            DONE
          </Button>
        </div>
      </div>
    </Modal>
  );
}
