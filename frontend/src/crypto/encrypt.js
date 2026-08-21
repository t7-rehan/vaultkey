/**
 * VaultKey Client-Side Cryptography Module
 * Uses standard Web Crypto API (AES-GCM 256-bit)
 */

function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Encrypts a File or Blob in the browser using AES-GCM 256-bit.
 * @param {File} file - PDF File object to encrypt
 * @param {Function} onProgress - Progress callback function (0-100)
 * @returns {Promise<{ encryptedBlob: Blob, ivHex: string, keyHex: string }>}
 */
export async function encryptFile(file, onProgress = () => {}) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error("Web Crypto API is not supported in this browser environment.");
  }

  onProgress(10); // Started reading file

  const fileBuffer = await file.arrayBuffer();
  onProgress(30); // File read complete

  // Generate 256-bit AES-GCM Key
  const key = await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256
    },
    true, // extractable
    ["encrypt", "decrypt"]
  );

  onProgress(50); // Key generated

  // Generate cryptographically secure 12-byte IV (Initialization Vector)
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // Encrypt PDF file buffer
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    fileBuffer
  );

  onProgress(80); // Ciphertext generated

  // Export raw key bytes as Hex string
  const exportedRawKey = await window.crypto.subtle.exportKey("raw", key);
  const keyHex = arrayBufferToHex(exportedRawKey);
  const ivHex = arrayBufferToHex(iv);

  const encryptedBlob = new Blob([ciphertextBuffer], { type: "application/octet-stream" });

  onProgress(100); // Encryption complete

  return {
    encryptedBlob,
    ivHex,
    keyHex
  };
}
