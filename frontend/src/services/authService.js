import { request } from './api';

export async function getCurrentUser() {
  return await request('/auth/me', { method: 'GET' });
}
