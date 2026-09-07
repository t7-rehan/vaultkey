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
 * Magic-byte signatures for binary file types.
 * Each entry provides a byte offset and the expected hex prefix.
 */
const MAGIC_BYTES = {
  pdf:  { offset: 0, hex: '25504446' },         // %PDF
  png:  { offset: 0, hex: '89504e47' },         // \x89PNG
  jpg:  { offset: 0, hex: 'ffd8ff' },           // JFIF / EXIF SOI marker
  jpeg: { offset: 0, hex: 'ffd8ff' },
  gif:  { offset: 0, hex: '474946' },           // GIF
  webp: { offset: 8, hex: '57454250' },         // RIFF????WEBP (bytes 8-11)
};

/**
 * Text-based extensions that must not contain null bytes.
 */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'js', 'py', 'html', 'css', 'csv', 'log',
]);

/**
 * Validates file content before encryption.
 * - Binary types: first bytes must match the known magic-byte signature.
 * - Text types: file must not contain null bytes (0x00).
 *
 * @param {File} file - The File object to validate
 * @param {ArrayBuffer} buffer - The file's ArrayBuffer (already read)
 * @throws {Error} if the file content does not match its declared type
 */
function validateFileContent(file, buffer) {
  const bytes = new Uint8Array(buffer);
  const ext = file.name.split('.').pop().toLowerCase();

  if (MAGIC_BYTES[ext] !== undefined) {
    const { offset, hex: expectedHex } = MAGIC_BYTES[ext];
    const slice = bytes.slice(offset, offset + expectedHex.length / 2);
    const actualHex = Array.from(slice)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    if (!actualHex.startsWith(expectedHex)) {
      throw new Error(
        `Invalid file: content does not match the .${ext} format. ` +
        `Expected magic bytes ${expectedHex}, got ${actualHex.slice(0, expectedHex.length)}.`
      );
    }
  } else if (TEXT_EXTENSIONS.has(ext)) {
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x00) {
        throw new Error(
          `Invalid file: .${ext} files must not contain binary (null) bytes. ` +
          `Found null byte at offset ${i}.`
        );
      }
    }
  }
}

/**
 * Encrypts a File or Blob in the browser using AES-GCM 256-bit.
 * Validates file content against magic bytes / null-byte rules before encrypting.
 * @param {File} file - File object to encrypt
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

  // Validate content before any cryptographic operations
  validateFileContent(file, fileBuffer);

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

  // Encrypt file buffer
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
