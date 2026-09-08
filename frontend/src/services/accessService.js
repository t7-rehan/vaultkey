import { request } from './api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export async function checkRecipientAccess(token) {
  return await request(`/access/${token}`, {
    method: 'GET',
  });
}

export async function authorizePassword(token, password) {
  return await request(`/access/${token}/authorize`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

/**
 * Fetches the raw encrypted ciphertext for DOWNLOAD-mode shares.
 * Returns ArrayBuffer + custom response headers.
 */
export async function downloadEncryptedFile(token, password = null) {
  const response = await fetch(`${API_BASE}/access/${token}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    let errorMessage = 'Download failed';
    try {
      const data = await response.json();
      errorMessage = data.detail || data.message || response.statusText;
    } catch (_) {
      errorMessage = response.statusText;
    }
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  return _parseEncryptedResponse(response);
}

/**
 * Fetches the raw encrypted ciphertext for VIEW_ONLY shares.
 * Calls /view instead of /download — the backend logs VIEW_STARTED and
 * never increments the download counter.
 */
export async function viewEncryptedFile(token, password = null) {
  const response = await fetch(`${API_BASE}/access/${token}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    let errorMessage = 'Unable to load file for viewing';
    try {
      const data = await response.json();
      errorMessage = data.detail || data.message || response.statusText;
    } catch (_) {
      errorMessage = response.statusText;
    }
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  return _parseEncryptedResponse(response);
}

/**
 * Reports a browser-side blocked action (e.g. Ctrl+S, Ctrl+P) to the backend
 * so the share owner can see that view-only restrictions were triggered.
 *
 * Fire-and-forget — failures are silently swallowed to avoid disrupting the
 * viewer UX.  No sensitive data (key, blob content) is sent.
 *
 * @param {string} token - Share token from the URL path.
 * @param {string} event - One of: PRINT_BLOCKED | DOWNLOAD_BLOCKED |
 *                         SAVE_ATTEMPT_BLOCKED | VIEW_STARTED | VIEW_COMPLETED
 */
export async function reportBlockedAction(token, event) {
  try {
    await fetch(`${API_BASE}/access/${token}/report-blocked`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    });
  } catch (_) {
    // Silently ignore — audit reporting must never break the viewer.
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _parseEncryptedResponse(response) {
  const ivHex = response.headers.get('X-IV-Hex');
  const originalFilename = response.headers.get('X-Original-Filename') || 'download';
  // X-Mime-Type carries the server-stored MIME type.
  // Falls back to null so the caller's resolveMimeType() can apply its own chain.
  const mimeType = response.headers.get('X-Mime-Type') || null;
  const arrayBuffer = await response.arrayBuffer();

  return { arrayBuffer, ivHex, originalFilename, mimeType };
}
