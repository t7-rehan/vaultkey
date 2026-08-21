import { request } from './api';

export async function getActivityLogs(fileId = null) {
  const url = fileId ? `/activity?file_id=${fileId}` : '/activity';
  return await request(url, {
    method: 'GET',
  });
}
