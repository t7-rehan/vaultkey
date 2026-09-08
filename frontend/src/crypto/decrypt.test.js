/**
 * Tests for VaultKey client-side decryption module.
 *
 * Covers:
 *  - resolveMimeType: all supported types, extension fallback, unknown types, edge cases
 *  - decryptFile: round-trip encryption/decryption with correct Blob MIME type for each
 *    supported file type; verifies no hard-coded "application/pdf" leak
 */

import { describe, it, expect } from 'vitest';
import { resolveMimeType, decryptFile } from './decrypt.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Encrypts `plaintext` bytes with AES-GCM using the provided key and IV,
 * returning the ciphertext ArrayBuffer. Used to produce valid test inputs
 * for decryptFile without depending on the real encrypt.js module.
 */
async function encryptTestPayload(plaintext, keyHex, ivHex) {
  const keyBytes = Uint8Array.from(
    keyHex.match(/.{2}/g).map((b) => parseInt(b, 16))
  );
  const ivBytes = Uint8Array.from(
    ivHex.match(/.{2}/g).map((b) => parseInt(b, 16))
  );

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  return crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    cryptoKey,
    new TextEncoder().encode(plaintext)
  );
}

/** Fixed 256-bit test key (hex) — never used in production. */
const TEST_KEY_HEX = 'a'.repeat(64); // 32 bytes of 0xaa
/** Fixed 12-byte IV (hex). */
const TEST_IV_HEX = 'b'.repeat(24);  // 12 bytes of 0xbb

// ---------------------------------------------------------------------------
// resolveMimeType — unit tests (no crypto, no DOM)
// ---------------------------------------------------------------------------

describe('resolveMimeType', () => {
  describe('server-supplied MIME type takes highest priority', () => {
    it('returns the server MIME type as-is for PDF', () => {
      expect(resolveMimeType('application/pdf', 'file.pdf')).toBe('application/pdf');
    });

    it('returns the server MIME type as-is for PNG', () => {
      expect(resolveMimeType('image/png', 'photo.png')).toBe('image/png');
    });

    it('returns the server MIME type even when filename extension disagrees', () => {
      // Server wins — trust the stored metadata
      expect(resolveMimeType('image/png', 'file.pdf')).toBe('image/png');
    });

    it('trims leading/trailing whitespace from server MIME type', () => {
      expect(resolveMimeType('  text/plain  ', 'notes.txt')).toBe('text/plain');
    });
  });

  describe('extension-based fallback when server MIME type is absent', () => {
    const cases = [
      ['invoice.pdf',  'application/pdf'],
      ['photo.png',    'image/png'],
      ['image.jpg',    'image/jpeg'],
      ['image.jpeg',   'image/jpeg'],
      ['anim.gif',     'image/gif'],
      ['pic.webp',     'image/webp'],
      ['notes.txt',    'text/plain'],
      ['readme.md',    'text/markdown'],
      ['data.json',    'application/json'],
      ['script.js',    'text/javascript'],
      ['code.py',      'text/x-python'],
      ['page.html',    'text/html'],
      ['style.css',    'text/css'],
      ['report.csv',   'text/csv'],
      ['app.log',      'text/plain'],
    ];

    it.each(cases)('%s → %s', (filename, expected) => {
      expect(resolveMimeType(null, filename)).toBe(expected);
    });

    it('is case-insensitive for the extension', () => {
      expect(resolveMimeType(null, 'PHOTO.PNG')).toBe('image/png');
      expect(resolveMimeType(null, 'Report.CSV')).toBe('text/csv');
      expect(resolveMimeType(null, 'invoice.PDF')).toBe('application/pdf');
    });
  });

  describe('generic binary fallback for unknown types', () => {
    it('returns application/octet-stream for an unknown extension', () => {
      expect(resolveMimeType(null, 'archive.zip')).toBe('application/octet-stream');
    });

    it('returns application/octet-stream for a .exe extension', () => {
      expect(resolveMimeType(null, 'setup.exe')).toBe('application/octet-stream');
    });

    it('returns application/octet-stream when filename has no extension', () => {
      expect(resolveMimeType(null, 'Makefile')).toBe('application/octet-stream');
    });

    it('returns application/octet-stream when both server type and filename are absent', () => {
      expect(resolveMimeType(null, '')).toBe('application/octet-stream');
    });

    it('returns application/octet-stream when server type is empty string', () => {
      expect(resolveMimeType('', 'unknown.bin')).toBe('application/octet-stream');
    });
  });

  describe('never falls back to application/pdf', () => {
    it('does not produce application/pdf for an unknown file with no server type', () => {
      const result = resolveMimeType(null, 'mystery');
      expect(result).not.toBe('application/pdf');
    });

    it('does not produce application/pdf for a .png when server type is absent', () => {
      const result = resolveMimeType(null, 'photo.png');
      expect(result).not.toBe('application/pdf');
    });

    it('does not produce application/pdf when server type is empty and no filename', () => {
      const result = resolveMimeType('', '');
      expect(result).not.toBe('application/pdf');
    });
  });
});

// ---------------------------------------------------------------------------
// decryptFile — round-trip tests with real Web Crypto (jsdom environment)
// ---------------------------------------------------------------------------

describe('decryptFile — Blob MIME type correctness', () => {
  /**
   * Encrypts a short plaintext, decrypts it with decryptFile, and asserts
   * the resulting Blob has the expected MIME type.
   */
  async function roundTrip(mimeType, filename) {
    const ciphertext = await encryptTestPayload('hello vaultkey', TEST_KEY_HEX, TEST_IV_HEX);
    const blob = await decryptFile(ciphertext, TEST_IV_HEX, TEST_KEY_HEX, mimeType, filename);
    return blob;
  }

  describe('server MIME type is used directly', () => {
    const cases = [
      ['invoice.pdf',  'application/pdf'],
      ['photo.png',    'image/png'],
      ['image.jpg',    'image/jpeg'],
      ['image.jpeg',   'image/jpeg'],
      ['anim.gif',     'image/gif'],
      ['pic.webp',     'image/webp'],
      ['notes.txt',    'text/plain'],
      ['data.json',    'application/json'],
      ['report.csv',   'text/csv'],
    ];

    it.each(cases)(
      'Blob.type === "%s" when server supplies MIME type',
      async (filename, mime) => {
        const blob = await roundTrip(mime, filename);
        expect(blob.type).toBe(mime);
      }
    );
  });

  describe('extension fallback when server MIME type is null', () => {
    const cases = [
      ['invoice.pdf',  null, 'application/pdf'],
      ['photo.png',    null, 'image/png'],
      ['image.jpg',    null, 'image/jpeg'],
      ['image.jpeg',   null, 'image/jpeg'],
      ['anim.gif',     null, 'image/gif'],
      ['pic.webp',     null, 'image/webp'],
      ['notes.txt',    null, 'text/plain'],
      ['data.json',    null, 'application/json'],
      ['report.csv',   null, 'text/csv'],
    ];

    it.each(cases)(
      '%s + null mimeType → Blob.type === "%s"',
      async (filename, mimeType, expected) => {
        const blob = await roundTrip(mimeType, filename);
        expect(blob.type).toBe(expected);
      }
    );
  });

  it('decrypts successfully and content is non-empty', async () => {
    const ciphertext = await encryptTestPayload('vaultkey test content', TEST_KEY_HEX, TEST_IV_HEX);
    const blob = await decryptFile(ciphertext, TEST_IV_HEX, TEST_KEY_HEX, 'text/plain', 'test.txt');
    expect(blob.size).toBeGreaterThan(0);
    const text = await blob.text();
    expect(text).toBe('vaultkey test content');
  });

  it('Blob.type is never application/pdf for a PNG file', async () => {
    const ciphertext = await encryptTestPayload('png data', TEST_KEY_HEX, TEST_IV_HEX);
    const blob = await decryptFile(ciphertext, TEST_IV_HEX, TEST_KEY_HEX, 'image/png', 'photo.png');
    expect(blob.type).toBe('image/png');
    expect(blob.type).not.toBe('application/pdf');
  });

  it('Blob.type falls back to application/octet-stream for unknown type', async () => {
    const ciphertext = await encryptTestPayload('binary', TEST_KEY_HEX, TEST_IV_HEX);
    const blob = await decryptFile(ciphertext, TEST_IV_HEX, TEST_KEY_HEX, null, 'archive.zip');
    expect(blob.type).toBe('application/octet-stream');
  });

  it('Blob.type falls back to application/octet-stream when both mimeType and filename are absent', async () => {
    const ciphertext = await encryptTestPayload('data', TEST_KEY_HEX, TEST_IV_HEX);
    const blob = await decryptFile(ciphertext, TEST_IV_HEX, TEST_KEY_HEX, null, '');
    expect(blob.type).toBe('application/octet-stream');
  });

  it('throws on corrupted ciphertext', async () => {
    const garbage = new Uint8Array(64).fill(0xff).buffer;
    await expect(
      decryptFile(garbage, TEST_IV_HEX, TEST_KEY_HEX, 'application/pdf', 'test.pdf')
    ).rejects.toThrow('Unable to decrypt file');
  });

  it('throws on invalid IV hex', async () => {
    const ciphertext = await encryptTestPayload('test', TEST_KEY_HEX, TEST_IV_HEX);
    // Odd-length hex is invalid
    await expect(
      decryptFile(ciphertext, 'xyz', TEST_KEY_HEX, 'text/plain', 'test.txt')
    ).rejects.toThrow();
  });

  it('existing PDF functionality is not broken', async () => {
    const ciphertext = await encryptTestPayload('%PDF-1.4 mock content', TEST_KEY_HEX, TEST_IV_HEX);
    const blob = await decryptFile(ciphertext, TEST_IV_HEX, TEST_KEY_HEX, 'application/pdf', 'document.pdf');
    expect(blob.type).toBe('application/pdf');
    const text = await blob.text();
    expect(text).toBe('%PDF-1.4 mock content');
  });
});
