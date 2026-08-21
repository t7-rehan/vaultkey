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
 * Decrypts an encrypted ArrayBuffer in the browser using AES-GCM 256-bit key.
 * @param {ArrayBuffer} encryptedBuffer - Ciphertext ArrayBuffer
 * @param {string} ivHex - Hex string of 12-byte IV
 * @param {string} keyHex - Hex string of 256-bit AES key
 * @returns {Promise<Blob>} Decrypted PDF Blob
 */
export async function decryptFile(encryptedBuffer, ivHex, keyHex) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error("Web Crypto API is not supported in this browser environment.");
  }

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

    return new Blob([decryptedBuffer], { type: "application/pdf" });
  } catch (err) {
    console.error("Decryption error:", err);
    throw new Error("Unable to decrypt file. The key or file payload may be corrupted or invalid.");
  }
}
