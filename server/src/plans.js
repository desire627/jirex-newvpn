import crypto from 'node:crypto';
import { one, query } from './db.js';

// Plans live in the database so admins can change prices and add plans in Settings.
// Prices are whole amounts in CURRENCY (server/.env, default RUB).
// The first start fills in the original three plans (see schema.sql).

const toPlan = (r) => ({
  id: r.id,
  name: { en: r.name_en, ru: r.name_ru },
  days: r.days,
  price: r.price,
  active: r.active,
  featured: r.featured,
});

// All plans, shortest first. Hidden plans are still returned (with active: false) so old
// payments can show their plan's name; only active plans can be bought.
export async function listPlans() {
  const { rows } = await query('SELECT * FROM plans ORDER BY days, price, created_at');
  return rows.map(toPlan);
}

export async function getPlan(id) {
  const r = await one('SELECT * FROM plans WHERE id = $1', [String(id || '')]);
  return r ? toPlan(r) : null;
}

// Validates admin input; returns { error } or { values }.
export function readPlanInput(body, { partial = false } = {}) {
  const v = {};
  const has = (k) => body?.[k] !== undefined;
  if (!partial || has('nameEn') || has('nameRu')) {
    const en = String(body?.nameEn ?? '').trim();
    const ru = String(body?.nameRu ?? '').trim() || en;
    if (!en) return { error: 'plan_name_required' };
    if (en.length > 40 || ru.length > 40) return { error: 'plan_name_long' };
    v.name_en = en;
    v.name_ru = ru;
  }
  if (!partial || has('days')) {
    const days = Number(body?.days);
    if (!Number.isInteger(days) || days < 1 || days > 3650) return { error: 'plan_days_range' };
    v.days = days;
  }
  if (!partial || has('price')) {
    const price = Number(body?.price);
    if (!Number.isInteger(price) || price < 1 || price > 10_000_000) return { error: 'plan_price_range' };
    v.price = price;
  }
  if (has('active')) v.active = Boolean(body.active);
  if (has('featured')) v.featured = Boolean(body.featured);
  return { values: v };
}

export function newPlanId(name) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'plan';
  return `${slug}-${crypto.randomBytes(3).toString('hex')}`;
}
