import { request } from './api';

export async function loginUser(email, password) {
  const data = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.access_token) {
    localStorage.setItem('vaultkey_token', data.access_token);
  }
  return data;
}

export async function registerUser(email, password) {
  const data = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data.access_token) {
    localStorage.setItem('vaultkey_token', data.access_token);
  }
  return data;
}

export async function getCurrentUser() {
  return await request('/auth/me', {
    method: 'GET',
  });
}

export function logoutUser() {
  localStorage.removeItem('vaultkey_token');
}
