import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useI18n } from './i18n/index.jsx';

// Plans come from the server (admins edit them in Settings). They're loaded once and shared,
// so any page can show a plan's name in the visitor's language.
let cache = null;
let pending = null;
const listeners = new Set();

export function reloadPlans() {
  pending = api('/billing/plans')
    .then((data) => {
      cache = data;
      listeners.forEach((fn) => fn(data));
      return data;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

// { plans (on sale), allPlans (including hidden), currency, maxDevices, paymentsOpen } or null while loading.
export function usePlans() {
  const [data, setData] = useState(cache);
  useEffect(() => {
    listeners.add(setData);
    if (!cache && !pending) reloadPlans().catch(() => {});
    return () => listeners.delete(setData);
  }, []);
  return data;
}

// Plan names and lengths in the current language.
export function usePlanText() {
  const data = usePlans();
  const { t, lang } = useI18n();
  // A built-in text for this key if there is one, otherwise the fallback.
  const known = (key, params, fallback) => {
    const v = t(key, params);
    return v === key ? fallback : v;
  };
  // The original weekly/monthly/yearly plans keep their hand-written texts while their length is unchanged.
  const isOriginal = (plan) => ({ weekly: 7, monthly: 30, yearly: 365 })[plan.id] === plan.days;
  const name = (planOrId) => {
    const plan = typeof planOrId === 'object' && planOrId ? planOrId : data?.allPlans?.find((p) => p.id === planOrId);
    if (plan?.name) return plan.name[lang] || plan.name.en;
    const id = typeof planOrId === 'string' ? planOrId : plan?.id || '';
    return known(`plans.${id}`, {}, id);
  };
  // "week", "month", "year", or "90 days"
  const unit = (plan) => {
    const map = { 7: 'weekly', 30: 'monthly', 365: 'yearly' };
    return map[plan.days] ? t(`planUnit.${map[plan.days]}`) : t('common.days', { count: plan.days });
  };
  return { name, unit, known, isOriginal };
}
