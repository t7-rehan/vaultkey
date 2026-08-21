/**
 * VaultKey Key & Fragment URL Helper Module
 * Manages zero-knowledge fragment URL construction and parsing.
 * Fragment URLs format: /share/{raw_token}#key={hex_key}
 */

/**
 * Builds the full recipient link including the zero-knowledge URL fragment.
 * @param {string} rawToken - Server share token
 * @param {string} keyHex - Client-side raw 256-bit encryption key hex
 * @returns {string} Absolute URL string
 */
export function buildShareUrl(rawToken, keyHex) {
  const origin = window.location.origin;
  return `${origin}/share/${rawToken}#key=${keyHex}`;
}

/**
 * Extracts the encryption key from window.location.hash
 * @param {string} hash - Location hash e.g. "#key=a1b2c3..."
 * @returns {string|null} Hex key string or null if absent
 */
export function extractKeyFromFragment(hash = window.location.hash) {
  if (!hash) return null;
  const cleanHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(cleanHash);
  return params.get('key');
}
