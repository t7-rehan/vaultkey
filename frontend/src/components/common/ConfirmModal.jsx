import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { AlertTriangle } from 'lucide-react';

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Revoke access?",
  message = "Future access to this VaultKey link will be denied.",
  confirmText = "REVOKE ACCESS",
  cancelText = "CANCEL",
  loading = false
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 rounded-xl shrink-0">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-normal">
            {message}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-medium">
            Note: Revocation prevents future access; it cannot reclaim files already downloaded to a recipient's device.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {cancelText}
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={loading}>
          {confirmText}
        </Button>
      </div>
    </Modal>
  );
}
