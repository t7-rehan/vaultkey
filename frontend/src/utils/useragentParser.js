/**
 * Parses raw User-Agent string into human-readable Browser and Operating System format.
 * Example input: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
 * Output: "Chrome on Windows 10"
 */
export function parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown Device', os: '', deviceType: 'desktop', full: 'Unknown Client' };

  let browser = 'Browser';
  let os = '';
  let deviceType = 'desktop';

  // Detect OS
  if (ua.includes('Windows NT 10.0')) os = 'Windows 10/11';
  else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1';
  else if (ua.includes('Windows NT 6.1')) os = 'Windows 7';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Android')) { os = 'Android'; deviceType = 'mobile'; }
  else if (ua.includes('iPhone') || ua.includes('iPad')) { os = 'iOS'; deviceType = 'mobile'; }
  else if (ua.includes('Linux')) os = 'Linux';
  else os = '';

  // Detect Browser
  if (ua.includes('Edg/')) browser = 'Microsoft Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';
  else browser = 'Web Browser';

  const full = os ? `${browser} on ${os}` : browser;

  return {
    browser,
    os,
    deviceType,
    full
  };
}

export function formatIpAddress(ip) {
  if (!ip) return '127.0.0.1 (Localhost)';
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return '127.0.0.1 (Localhost)';
  return ip;
}
