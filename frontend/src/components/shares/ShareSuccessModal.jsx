import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Check, Copy, ShieldCheck, Clock, Hash, Lock, AlertTriangle, Key } from 'lucide-react';

export function ShareSuccessModal({ isOpen, onClose, shareData }) {
  const [copied, setCopied] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  if (!shareData) return null;

  // Extract the encryption key from the URL fragment
  const encryptionKey = shareData.shareUrl.split('#key=')[1] || '';

  const handleCopy = () => {
    navigator.clipboard.writeText(shareData.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleKeyCopy = () => {
    navigator.clipboard.writeText(encryptionKey);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2500);
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

        {/* Encryption Key Display */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" />
            Encryption Key (also in URL above)
          </label>
          <div className="flex items-center gap-2 p-2 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-xl">
            <input
              type="text"
              readOnly
              value={encryptionKey}
              className="flex-1 bg-transparent text-xs font-mono text-gray-800 dark:text-gray-200 px-2 outline-none select-all truncate"
            />
            <Button
              variant="secondary"
              size="sm"
              icon={keyCopied ? Check : Copy}
              onClick={handleKeyCopy}
            >
              {keyCopied ? 'COPIED!' : 'COPY KEY'}
            </Button>
          </div>
        </div>

        {/* Critical Warning Banner */}
        <div className="flex items-start gap-3 p-3.5 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 rounded-xl text-xs border border-amber-200 dark:border-amber-800/50">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="font-bold">VaultKey never stores your encryption key</p>
            <p className="text-amber-800 dark:text-amber-300">
              If you lose this key or the full share URL, the file <strong>cannot be decrypted by anyone</strong> — including you. 
              Save the key or the full share URL in a safe place before closing this window.
            </p>
          </div>
        </div>

        {/* Mandatory Acknowledgment Checkbox */}
        <label className="flex items-start gap-3 p-3 bg-gray-50/70 dark:bg-surface-darkSecondary/50 rounded-xl border border-[#E6EAF0] dark:border-[#253044] cursor-pointer hover:bg-gray-100/70 dark:hover:bg-surface-darkSecondary transition-colors">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 w-4 h-4 text-brand-500 border-gray-300 dark:border-gray-600 rounded focus:ring-brand-500 focus:ring-2"
          />
          <span className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
            I have saved my encryption key or share URL in a safe place and understand it cannot be recovered if lost.
          </span>
        </label>

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
          <Button 
            variant="secondary" 
            onClick={onClose}
            disabled={!acknowledged}
          >
            DONE
          </Button>
        </div>
      </div>
    </Modal>
  );
}
