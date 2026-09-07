/**
 * Task 1 — Bug Condition Exploration Tests: Issue 5
 * ==================================================
 * Issue 5 — No File-Content Validation Before Encryption
 *
 * These tests verify that the validateFileContent guard is in place inside
 * encryptFile() and behaves correctly:
 *   - Invalid binary files (wrong magic bytes) are rejected before encryption.
 *   - Text files containing null bytes (0x00) are rejected before encryption.
 *   - Valid files of known types are accepted and encrypted successfully.
 *
 * Uses Vitest
 *
 * Run with:
 *   npm test
 *
 * Validates: Requirements 2.1, 2.2, 2.3 (Issue 5)
 *
 * isBugCondition_5:
 *   (isBinaryExtension(ext) AND NOT matchesMagicBytes(bytes, ext))
 *   OR (isTextExtension(ext) AND containsNullBytes(bytes))
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Shim: reproduce the pure-logic layer of encrypt.js without the Web Crypto
// dependency, so we can unit-test validateFileContent in isolation.
// ---------------------------------------------------------------------------

/**
 * Magic-byte signatures — kept in sync with encrypt.js.
 */
const MAGIC_BYTES = {
  pdf:  { offset: 0, hex: "25504446" },        // %PDF
  png:  { offset: 0, hex: "89504e47" },        // \x89PNG
  jpg:  { offset: 0, hex: "ffd8ff" },          // JFIF / EXIF SOI marker
  jpeg: { offset: 0, hex: "ffd8ff" },
  gif:  { offset: 0, hex: "474946" },          // GIF
  webp: { offset: 8, hex: "57454250" },        // RIFF????WEBP
};

/**
 * Text-based extensions — kept in sync with encrypt.js.
 */
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "json", "js", "py", "html", "css", "csv", "log",
]);

/**
 * Direct copy of the validateFileContent function from encrypt.js.
 * Duplicated here so the test can exercise it without needing to import
 * the full module (which depends on window.crypto.subtle).
 *
 * @param {{ name: string }} file  - object with a .name property
 * @param {ArrayBuffer}      buffer
 */
function validateFileContent(file, buffer) {
  const bytes = new Uint8Array(buffer);
  const ext = file.name.split(".").pop().toLowerCase();

  if (MAGIC_BYTES[ext] !== undefined) {
    const { offset, hex: expectedHex } = MAGIC_BYTES[ext];
    const slice = bytes.slice(offset, offset + expectedHex.length / 2);
    const actualHex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an ArrayBuffer from a hex string. */
function hexToBuffer(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr.buffer;
}

/** Build an ArrayBuffer from a Uint8Array. */
function bytesToBuffer(arr) {
  return arr.buffer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Issue 5 — validateFileContent: magic-byte validation", () => {
  // ---- PDF ----------------------------------------------------------------

  it("accepts a valid PDF (starts with %PDF = 25504446)", () => {
    const buf = hexToBuffer("255044462d312e34"); // %PDF-1.4
    expect(() => validateFileContent({ name: "report.pdf" }, buf)).not.toThrow();
  });

  it("rejects a JPEG renamed to .pdf (magic bytes FFD8FF, not 25504446)", () => {
    const buf = hexToBuffer("ffd8ffE000104a46494600"); // JPEG SOI + JFIF marker
    expect(() => validateFileContent({ name: "fake.pdf" }, buf)).toThrow(/does not match the \.pdf format/);
    expect(() => validateFileContent({ name: "fake.pdf" }, buf)).toThrow(/Expected magic bytes 25504446/);
  });

  // ---- PNG ----------------------------------------------------------------

  it("accepts a valid PNG (starts with 89504e47)", () => {
    const buf = hexToBuffer("89504e470d0a1a0a"); // PNG signature
    expect(() => validateFileContent({ name: "image.png" }, buf)).not.toThrow();
  });

  it("rejects a PDF renamed to .png", () => {
    const buf = hexToBuffer("255044462d312e34"); // %PDF-1.4
    expect(() => validateFileContent({ name: "fake.png" }, buf)).toThrow(/does not match the \.png format/);
  });

  // ---- JPEG ---------------------------------------------------------------

  it("accepts a valid JPEG (starts with FFD8FF)", () => {
    const buf = hexToBuffer("ffd8ffe000104a4649460001");
    expect(() => validateFileContent({ name: "photo.jpg" }, buf)).not.toThrow();
  });

  it("accepts a valid JPEG with .jpeg extension", () => {
    const buf = hexToBuffer("ffd8ffe000104a4649460001");
    expect(() => validateFileContent({ name: "photo.jpeg" }, buf)).not.toThrow();
  });

  it("rejects a PNG renamed to .jpg", () => {
    const buf = hexToBuffer("89504e470d0a1a0a");
    expect(() => validateFileContent({ name: "fake.jpg" }, buf)).toThrow(/does not match the \.jpg format/);
  });

  // ---- GIF ----------------------------------------------------------------

  it("accepts a valid GIF (starts with 474946 = GIF)", () => {
    const buf = hexToBuffer("47494638396100"); // GIF89a
    expect(() => validateFileContent({ name: "anim.gif" }, buf)).not.toThrow();
  });

  it("rejects random bytes as .gif", () => {
    const buf = hexToBuffer("deadbeef");
    expect(() => validateFileContent({ name: "fake.gif" }, buf)).toThrow();
  });

  // ---- WEBP ---------------------------------------------------------------

  it("accepts a valid WEBP (bytes 8-11 = 57454250 = WEBP)", () => {
    // RIFF????WEBP: 4 bytes RIFF + 4 bytes size + WEBP
    const arr = new Uint8Array([
      0x52, 0x49, 0x46, 0x46,  // RIFF
      0x00, 0x00, 0x00, 0x00,  // size (irrelevant)
      0x57, 0x45, 0x42, 0x50,  // WEBP
    ]);
    expect(() => validateFileContent({ name: "img.webp" }, bytesToBuffer(arr))).not.toThrow();
  });

  it("rejects a non-WEBP file with .webp extension", () => {
    const arr = new Uint8Array(12).fill(0xaa);
    expect(() => validateFileContent({ name: "fake.webp" }, bytesToBuffer(arr))).toThrow();
  });
});

describe("Issue 5 — validateFileContent: text / null-byte validation", () => {
  // ---- TXT ----------------------------------------------------------------

  it("accepts a .txt file with no null bytes", () => {
    const encoder = new TextEncoder();
    const buf = encoder.encode("Hello, world!").buffer;
    expect(() => validateFileContent({ name: "readme.txt" }, buf)).not.toThrow();
  });

  it("rejects a .txt file containing a null byte (0x00)", () => {
    const arr = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x00, 0x6f]); // Hel\0o
    expect(() => validateFileContent({ name: "bad.txt" }, bytesToBuffer(arr))).toThrow(/must not contain binary \(null\) bytes/);
    expect(() => validateFileContent({ name: "bad.txt" }, bytesToBuffer(arr))).toThrow(/Found null byte at offset 4/);
  });

  // ---- JSON ---------------------------------------------------------------

  it("accepts a valid .json file without null bytes", () => {
    const encoder = new TextEncoder();
    const buf = encoder.encode('{"key":"value"}').buffer;
    expect(() => validateFileContent({ name: "data.json" }, buf)).not.toThrow();
  });

  it("rejects a .json file containing a null byte", () => {
    const arr = new Uint8Array([0x7b, 0x22, 0x00, 0x22, 0x7d]); // {"\0"}
    expect(() => validateFileContent({ name: "bad.json" }, bytesToBuffer(arr))).toThrow();
  });

  // ---- MD -----------------------------------------------------------------

  it("accepts a .md file without null bytes", () => {
    const encoder = new TextEncoder();
    const buf = encoder.encode("# Title\n\nParagraph.").buffer;
    expect(() => validateFileContent({ name: "README.md" }, buf)).not.toThrow();
  });

  it("rejects a .md file with a null byte", () => {
    const arr = new Uint8Array([0x23, 0x20, 0x54, 0x00]);
    expect(() => validateFileContent({ name: "bad.md" }, bytesToBuffer(arr))).toThrow();
  });

  // ---- All text extensions covered by the module -------------------------

  for (const ext of ["js", "py", "html", "css", "csv", "log"]) {
    it(`accepts a valid .${ext} file without null bytes`, () => {
      const encoder = new TextEncoder();
      const buf = encoder.encode(`valid ${ext} content`).buffer;
      expect(() => validateFileContent({ name: `file.${ext}` }, buf)).not.toThrow();
    });

    it(`rejects a .${ext} file with a null byte`, () => {
      const arr = new Uint8Array([0x61, 0x00, 0x62]); // a\0b
      expect(() => validateFileContent({ name: `bad.${ext}` }, bytesToBuffer(arr))).toThrow();
    });
  }
});

describe("Issue 5 — validateFileContent: unknown/unvalidated extensions", () => {
  it("does not throw for an unknown extension (no rule defined)", () => {
    const arr = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    // Unknown extension — no magic bytes and not a text extension
    expect(() => validateFileContent({ name: "archive.zip" }, bytesToBuffer(arr))).not.toThrow();
  });

  it("does not throw for a .enc file (ciphertext — extension not in either list)", () => {
    const arr = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(() => validateFileContent({ name: "file.enc" }, bytesToBuffer(arr))).not.toThrow();
  });
});

describe("Issue 5 — Source structure: validateFileContent is wired into encryptFile", () => {
  /**
   * These tests read the source of encrypt.js to confirm:
   *   1. validateFileContent is defined.
   *   2. MAGIC_BYTES and TEXT_EXTENSIONS are defined.
   *   3. validateFileContent is called BEFORE window.crypto.subtle.generateKey.
   *
   * Validates: Requirements 2.1, 2.2 (Issue 5)
   */
  const __dirname = dirname(fileURLToPath(import.meta.url));

  it("MAGIC_BYTES lookup table is defined in encrypt.js", () => {
    const src = readFileSync(join(__dirname, "encrypt.js"), "utf8");
    expect(src).toContain("const MAGIC_BYTES");
  });

  it("TEXT_EXTENSIONS set is defined in encrypt.js", () => {
    const src = readFileSync(join(__dirname, "encrypt.js"), "utf8");
    expect(src).toContain("const TEXT_EXTENSIONS");
  });

  it("validateFileContent function is defined in encrypt.js", () => {
    const src = readFileSync(join(__dirname, "encrypt.js"), "utf8");
    expect(src).toContain("function validateFileContent");
  });

  it("validateFileContent is called BEFORE generateKey in encryptFile", () => {
    const src = readFileSync(join(__dirname, "encrypt.js"), "utf8");

    // Find the encryptFile function body
    const encryptFnStart = src.indexOf("export async function encryptFile");
    expect(encryptFnStart).not.toBe(-1);

    const validateCallPos = src.indexOf("validateFileContent(", encryptFnStart);
    const generateKeyPos  = src.indexOf("generateKey(", encryptFnStart);

    expect(validateCallPos).not.toBe(-1);
    expect(generateKeyPos).not.toBe(-1);
    expect(validateCallPos).toBeLessThan(generateKeyPos);
  });
});
