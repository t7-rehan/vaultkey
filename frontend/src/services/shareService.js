import { request } from './api';

export async function createShareLink(fileId, expirationHours, maxDownloads, password) {
  return await request('/shares', {
    method: 'POST',
    body: JSON.stringify({
      file_id: fileId,
      expiration_hours: expirationHours,
      max_downloads: maxDownloads,
      password: password || null,
    }),
  });
}

export async function getUserShares(fileId = null) {
  const url = fileId ? `/shares?file_id=${fileId}` : '/shares';
  return await request(url, {
    method: 'GET',
  });
}

export async function getShareDetail(shareId) {
  return await request(`/shares/${shareId}`, {
    method: 'GET',
  });
}

export async function revokeShareLink(shareId) {
  return await request(`/shares/${shareId}/revoke`, {
    method: 'POST',
  });
}
