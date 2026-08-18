/**
 * API Request Helper for VaultKey
 */

const API_BASE = '/api';

export async function request(endpoint, options = {}) {
  const token = localStorage.getItem('vaultkey_token');

  const headers = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Auto-set Content-Type for JSON payloads if not FormData
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = 'An error occurred';
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

  // Handle empty or file blob responses
  const contentType = response.headers.get('Content-Type');
  if (contentType && contentType.includes('application/json')) {
    return await response.json();
  }

  return response;
}
