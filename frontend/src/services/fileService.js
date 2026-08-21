import { request } from './api';

export async function uploadEncryptedFile(encryptedBlob, originalFilename, ivHex) {
  const formData = new FormData();
  formData.append('file', encryptedBlob, `${originalFilename}.enc`);
  formData.append('original_filename', originalFilename);
  formData.append('iv_hex', ivHex);

  return await request('/files', {
    method: 'POST',
    body: formData,
  });
}

export async function getFiles() {
  return await request('/files', {
    method: 'GET',
  });
}

export async function getFileDetail(fileId) {
  return await request(`/files/${fileId}`, {
    method: 'GET',
  });
}

export async function deleteFile(fileId) {
  return await request(`/files/${fileId}`, {
    method: 'DELETE',
  });
}
