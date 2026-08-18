import React, { useState, useRef } from 'react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { FileUp, FileCheck, Shield, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { encryptFile } from '../../crypto/encrypt';
import { uploadEncryptedFile } from '../../services/fileService';

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export function UploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [state, setState] = useState('idle'); // idle | selected | validating | encrypting | uploading | complete | error
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);

  const resetState = () => {
    setSelectedFile(null);
    setState('idle');
    setProgress(0);
    setErrorMessage('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const validateFile = async (file) => {
    if (!file) return false;

    // Check size
    if (file.size > MAX_SIZE_BYTES) {
      setErrorMessage("File size exceeds the 50 MB limit.");
      setState('error');
      return false;
    }

    // Check file extension
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage("Only PDF files are supported.");
      setState('error');
      return false;
    }

    // Check PDF magic bytes (%PDF-)
    try {
      const buffer = await file.slice(0, 5).arrayBuffer();
      const header = new TextDecoder().decode(buffer);
      if (!header.startsWith('%PDF-')) {
        setErrorMessage("Invalid PDF file structure detected.");
        setState('error');
        return false;
      }
    } catch (e) {
      setErrorMessage("Could not validate file format.");
      setState('error');
      return false;
    }

    return true;
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage('');
    setState('validating');

    const isValid = await validateFile(file);
    if (isValid) {
      setSelectedFile(file);
      setState('selected');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setErrorMessage('');
    setState('validating');

    const isValid = await validateFile(file);
    if (isValid) {
      setSelectedFile(file);
      setState('selected');
    }
  };

  const handleStartUpload = async () => {
    if (!selectedFile) return;

    try {
      // Step 1: Encrypt file locally in browser
      setState('encrypting');
      setProgress(10);

      const { encryptedBlob, ivHex, keyHex } = await encryptFile(selectedFile, (p) => {
        setProgress(p);
      });

      // Step 2: Upload ciphertext
      setState('uploading');
      const uploadedRecord = await uploadEncryptedFile(encryptedBlob, selectedFile.name, ivHex);

      setState('complete');
      setTimeout(() => {
        onUploadSuccess(uploadedRecord, keyHex);
        handleClose();
      }, 800);

    } catch (err) {
      console.error("Upload/Encryption failure:", err);
      setErrorMessage(err.message || "Encryption or upload failed.");
      setState('error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload PDF"
      subtitle="Secure your file before sharing it."
    >
      <div className="space-y-6">
        {state === 'idle' || state === 'selected' || state === 'validating' || state === 'error' ? (
          <>
            {/* Dropzone */}
            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-150 ${
                selectedFile
                  ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/10'
                  : 'border-[#E6EAF0] dark:border-[#253044] hover:border-brand-400 bg-gray-50/50 dark:bg-surface-darkSecondary/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />

              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="p-3 bg-brand-500 text-white rounded-2xl shadow-md">
                    <FileCheck className="w-8 h-8" />
                  </div>
                  <span className="font-semibold text-sm text-gray-900 dark:text-white mt-1">
                    {selectedFile.name}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · PDF Document
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="p-3 bg-gray-100 dark:bg-surface-dark text-gray-500 dark:text-gray-400 rounded-2xl">
                    <FileUp className="w-8 h-8" />
                  </div>
                  <span className="font-medium text-sm text-gray-800 dark:text-gray-200">
                    Drop PDF here or <span className="text-brand-500 underline font-semibold">browse files</span>
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    PDF files only · Maximum 50 MB
                  </span>
                </div>
              )}
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 rounded-xl text-xs border border-rose-200 dark:border-rose-800/50">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Security Indicator */}
            <div className="flex items-center gap-2.5 p-3.5 bg-blue-50/70 dark:bg-brand-500/10 rounded-xl text-xs text-brand-700 dark:text-brand-400 border border-blue-100 dark:border-brand-500/20">
              <Shield className="w-4 h-4 shrink-0 text-brand-500" />
              <span>
                <strong>Client-side encrypted:</strong> Your file is encrypted using 256-bit AES-GCM in your browser before it is uploaded.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!selectedFile || state === 'validating'}
                onClick={handleStartUpload}
                icon={Lock}
              >
                Encrypt & Upload
              </Button>
            </div>
          </>
        ) : (
          /* Progress / Encrypting state */
          <div className="py-8 flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-brand-50 dark:bg-brand-500/10 text-brand-500 rounded-2xl animate-pulse">
              <Shield className="w-10 h-10" />
            </div>

            <div>
              <h4 className="text-base font-bold text-gray-900 dark:text-white">
                {state === 'encrypting' && "Encrypting locally..."}
                {state === 'uploading' && "Uploading ciphertext payload..."}
                {state === 'complete' && "Encryption Complete!"}
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                {state === 'encrypting' && "Your file is being encrypted in your browser using 256-bit AES-GCM before upload."}
                {state === 'uploading' && "Transmitting encrypted ciphertext payload to secure vault storage."}
                {state === 'complete' && "Encrypted blob successfully stored. Generating secure token..."}
              </p>
            </div>

            {/* Progress Bar */}
            <div className="w-full max-w-xs bg-gray-100 dark:bg-surface-darkSecondary rounded-full h-2 overflow-hidden">
              <div
                className="bg-brand-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>

            <span className="text-xs font-semibold text-brand-500">{progress}%</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
