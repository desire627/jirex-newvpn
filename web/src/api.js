import { getLocale, translate } from './i18n/index.jsx';

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    const isForm = body instanceof FormData; // file uploads
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new Error(translate('errors.network'));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // The server sends a code; show it in the visitor's language.
    const key = data.code && `errors.${data.code}`;
    const translated = key && translate(key, data.params || {});
    const message = translated && translated !== key ? translated : data.error || translate('errors.generic', { status: res.status });
    // A signed-in page got "not signed in": the session ended (signed out elsewhere or expired).
    if (res.status === 401 && data.code === 'not_logged_in' && path !== '/auth/me') {
      window.dispatchEvent(new Event('jirex:session-ended'));
    }
    const err = new Error(message);
    err.status = res.status;
    err.code = data.code;
    err.params = data.params || {};
    throw err;
  }
  return data;
}

export function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat(currency === 'RUB' ? 'ru-RU' : getLocale(), {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toLocaleString()}`;
  }
}

export function formatBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function formatDate(value) {
  return new Date(value).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString(getLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function daysUntil(value) {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value) - Date.now()) / 86_400_000));
}

// "lastSeen" is seconds since epoch of the last VPN handshake.
export function connectionState(lastSeen) {
  if (!lastSeen) return { tone: '', label: translate('dash.connNever') };
  const ago = Date.now() / 1000 - lastSeen;
  if (ago < 180) return { tone: 'ok', label: translate('dash.connNow') };
  return { tone: '', label: translate('dash.connLast', { ago: timeAgo(ago) }) };
}

function timeAgo(seconds) {
  if (seconds < 3600) return translate('dash.agoMin', { n: Math.round(seconds / 60) });
  if (seconds < 86400) return translate('dash.agoHours', { n: Math.round(seconds / 3600) });
  const days = Math.round(seconds / 86400);
  return days === 1 ? translate('dash.agoYesterday') : translate('dash.agoDays', { count: days });
}

export function fullName(u) {
  const first = u?.firstName ?? u?.first_name ?? '';
  const last = u?.lastName ?? u?.last_name ?? '';
  return `${first} ${last}`.trim();
}

// How much cheaper per day a plan is than the most expensive-per-day plan.
export function savingsVs(plans, plan) {
  const base = plans.reduce((a, b) => (a.price / a.days > b.price / b.days ? a : b));
  if (plan.id === base.id) return 0;
  return Math.round((1 - plan.price / plan.days / (base.price / base.days)) * 100);
}
