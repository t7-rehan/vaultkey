import { request } from './api';

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
 * Downloads the raw encrypted ciphertext payload and returns headers + ArrayBuffer
 */
export async function downloadEncryptedFile(token, password = null) {
  const response = await fetch(`/api/access/${token}/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    let errorMessage = 'Download failed';
    try {
      const data = await response.json();
      errorMessage = data.detail || data.message || response.statusText;
    } catch (e) {
      errorMessage = response.statusText;
    }
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  const ivHex = response.headers.get('X-IV-Hex');
  const originalFilename = response.headers.get('X-Original-Filename') || 'document.pdf';
  const arrayBuffer = await response.arrayBuffer();

  return {
    arrayBuffer,
    ivHex,
    originalFilename,
  };
}
