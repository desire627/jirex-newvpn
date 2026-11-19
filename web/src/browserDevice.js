import { api } from './api.js';

const INSTALLATION_KEY = 'jirex:web-installation';

function deviceDetails() {
  const ua = navigator.userAgent;
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    return { name: 'iPad', kind: 'tablet' };
  }
  if (/iPhone|iPod/i.test(ua)) return { name: 'iPhone', kind: 'phone' };
  if (/Android/i.test(ua)) return { name: 'Android', kind: /Mobile/i.test(ua) ? 'phone' : 'tablet' };
  if (/Windows/i.test(ua)) return { name: 'Windows PC', kind: 'desktop' };
  if (/Macintosh/i.test(ua)) return { name: 'Mac', kind: 'desktop' };
  return { name: 'Computer', kind: 'desktop' };
}

export async function registerApprovedBrowser(userId, stillCurrent) {
  const register = async () => {
    const registrationKey = `jirex:web-device:${userId}`;
    if (!stillCurrent() || localStorage.getItem(registrationKey)) return null;

    // An installation ID is saved before the request so retries reuse the same server record.
    let installationId = localStorage.getItem(INSTALLATION_KEY);
    if (!installationId) {
      installationId = crypto.randomUUID();
      localStorage.setItem(INSTALLATION_KEY, installationId);
    }
    const { servers } = await api('/servers');
    if (!stillCurrent() || !servers.length) return null;
    const { id } = await api('/devices', {
      method: 'POST',
      body: { ...deviceDetails(), serverId: servers[0].id, installationId, expectedUserId: userId },
    });
    // The customer can remove the device without a later approval adding it back.
    localStorage.setItem(registrationKey, String(id));
    return id;
  };

  // Serialize registration across tabs when available. The API also deduplicates by installation ID.
  return navigator.locks
    ? navigator.locks.request(`jirex:web-device:${userId}`, register)
    : register();
}
