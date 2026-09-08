/**
 * VaultKey Client-Side Decryption Module
 * Uses standard Web Crypto API (AES-GCM 256-bit)
 */

function hexToArrayBuffer(hexString) {
  if (!hexString || hexString.length % 2 !== 0) {
    throw new Error("Invalid hex string provided.");
  }
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    bytes[i / 2] = parseInt(hexString.substr(i, 2), 16);
  }
  return bytes.buffer;
}

/**
 * Maps common file extensions to their MIME types.
 * Used as a client-side fallback when the server does not return a MIME type.
 */
const EXTENSION_TO_MIME = {
  ".pdf":  "application/pdf",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".txt":  "text/plain",
  ".md":   "text/markdown",
  ".json": "application/json",
  ".js":   "text/javascript",
  ".py":   "text/x-python",
  ".html": "text/html",
  ".css":  "text/css",
  ".csv":  "text/csv",
  ".log":  "text/plain",
};

/**
 * Resolves the MIME type for a decrypted file using a three-step fallback strategy:
 *   1. Use the MIME type returned by the server (stored with the file at upload time).
 *   2. Derive the MIME type from the file extension.
 *   3. Fall back to "application/octet-stream" (generic binary) as a last resort.
 *
 * "application/pdf" is never used as a fallback — only when the file is actually a PDF.
 *
 * @param {string|null|undefined} serverMimeType - MIME type from the X-Mime-Type response header
 * @param {string} [filename=""] - Original filename (used for extension-based fallback)
 * @returns {string} Resolved MIME type
 */
export function resolveMimeType(serverMimeType, filename = "") {
  // 1. Trust the server-supplied MIME type when present and non-empty
  if (serverMimeType && serverMimeType.trim().length > 0) {
    return serverMimeType.trim();
  }

  // 2. Derive from filename extension
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex !== -1) {
    const ext = filename.slice(dotIndex).toLowerCase();
    const mapped = EXTENSION_TO_MIME[ext];
    if (mapped) {
      return mapped;
    }
  }

  // 3. Generic binary fallback — never application/pdf unless that was the stored type
  return "application/octet-stream";
}

/**
 * Decrypts an encrypted ArrayBuffer in the browser using AES-GCM 256-bit key.
 *
 * @param {ArrayBuffer} encryptedBuffer - Ciphertext ArrayBuffer
 * @param {string} ivHex - Hex string of 12-byte IV
 * @param {string} keyHex - Hex string of 256-bit AES key
 * @param {string} [mimeType] - Original MIME type of the file (from server metadata).
 *   When omitted or empty, resolveMimeType() derives it from `filename` or falls back
 *   to "application/octet-stream". Never defaults to "application/pdf".
 * @param {string} [filename=""] - Original filename, used for extension-based MIME fallback
 *   when `mimeType` is not provided.
 * @returns {Promise<Blob>} Decrypted Blob with the correct MIME type
 */
export async function decryptFile(encryptedBuffer, ivHex, keyHex, mimeType, filename = "") {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error("Web Crypto API is not supported in this browser environment.");
  }

  const resolvedMimeType = resolveMimeType(mimeType, filename);

  try {
    const rawKeyBuffer = hexToArrayBuffer(keyHex);
    const ivBuffer = hexToArrayBuffer(ivHex);

    // Import the raw key back into Web Crypto key object
    const importedKey = await window.crypto.subtle.importKey(
      "raw",
      rawKeyBuffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    // Decrypt the payload
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(ivBuffer)
      },
      importedKey,
      encryptedBuffer
    );

    return new Blob([decryptedBuffer], { type: resolvedMimeType });
  } catch (err) {
    console.error("Decryption error:", err);
    throw new Error("Unable to decrypt file. The key or file payload may be corrupted or invalid.");
  }
}
