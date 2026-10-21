// Shared server code for payments. Runs only on Netlify (never in the browser).
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const env = (k) => (typeof Netlify !== 'undefined' && Netlify.env?.get(k)) || process.env[k] || '';

export const SUPABASE_URL = () => env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
export const ANON_KEY = () => env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY');
export const siteUrl = (req) => env('SITE_URL') || env('URL') || new URL(req.url).origin;

/** Server client with full access. Never send this key to the browser. */
export function adminDb() {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new HttpError(500, 'The server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Netlify → Environment variables.');
  return createClient(SUPABASE_URL(), key, { auth: { persistSession: false, autoRefreshToken: false } });
}
/** Client acting as the signed-in organiser (their row-level security applies). */
export function userDb(token) {
  return createClient(SUPABASE_URL(), ANON_KEY(), { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
}

export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
export function handle(fn) {
  return async (req, context) => {
    try { return await fn(req, context); }
    catch (e) { const status = e.status || 500; if (status >= 500) console.error(e); return json(status, { error: e.message || 'Something went wrong' }); }
  };
}

/* ---------------- gateways ---------------- */

export const GATEWAYS = {
  stripe: { label: 'Card, Apple Pay or Google Pay', enabled: () => !!env('STRIPE_SECRET_KEY') },
  paystack: { label: 'Card or instant EFT (rand)', enabled: () => !!env('PAYSTACK_SECRET_KEY') },
};

/** Which gateways this visitor may use, best first. routes: {"default":"stripe","ZA":"paystack"} */
export function gatewaysFor(country, routes) {
  const enabled = Object.keys(GATEWAYS).filter((g) => GATEWAYS[g].enabled());
  const preferred = (country && routes?.[country]) || routes?.default || 'stripe';
  return [...new Set([preferred, routes?.default || 'stripe', ...enabled])].filter((g) => enabled.includes(g));
}

export const countryOf = (req, context) => (context?.geo?.country?.code || req.headers.get('x-country') || '').toUpperCase() || null;

/* ---------------- Stripe (REST, no SDK) ---------------- */

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.append(key, String(v));
  }
  return out;
}
export async function stripe(path, body) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`, 'content-type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
    body: body ? form(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new HttpError(502, 'Stripe: ' + (data.error?.message || r.statusText));
  return data;
}

/** Verify a Stripe-Signature header (t=…,v1=…) against the raw body. */
export function verifyStripe(raw, header, secret, toleranceSec = 300, now = Date.now()) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')).map(([k, ...v]) => [k, v.join('=')]));
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = +parts.t;
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw}`, 'utf8').digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

/* ---------------- Paystack ---------------- */

export async function paystack(path, body) {
  const r = await fetch('https://api.paystack.co/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${env('PAYSTACK_SECRET_KEY')}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok || data.status === false) throw new HttpError(502, 'Paystack: ' + (data.message || r.statusText));
  return data.data;
}
export function verifyPaystack(raw, header, secret = env('PAYSTACK_SECRET_KEY')) {
  if (!header || !secret) return false;
  const expected = crypto.createHmac('sha512', secret).update(raw, 'utf8').digest('hex');
  return header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/* ---------------- unlocking ---------------- */

/**
 * Mark a payment paid and add its days to the event. Safe to call twice for the
 * same payment (webhooks are retried): only the first call adds days.
 */
export async function markPaid(db, { ref, receiptUrl, payerEmail, amountCents, currency }) {
  const { data: pay, error } = await db.from('payments').select('*').eq('provider_ref', ref).maybeSingle();
  if (error) throw error;
  if (!pay) throw new HttpError(404, 'Unknown payment ' + ref);
  if (pay.status === 'paid') return { already: true, pay };
  if (amountCents != null && amountCents < pay.amount_cents) throw new HttpError(400, 'Paid amount is less than the price');
  const { data: upd, error: e1 } = await db.from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString(), receipt_url: receiptUrl || null, payer_email: payerEmail || pay.payer_email, ...(currency ? { currency } : {}) })
    .eq('id', pay.id).eq('status', 'pending').select('id');
  if (e1) throw e1;
  if (!upd?.length) return { already: true, pay }; // another delivery got there first
  const { data: ev, error: e2 } = await db.from('events').select('paid_days').eq('id', pay.event_id).single();
  if (e2) throw e2;
  const { error: e3 } = await db.from('events').update({ paid_days: (ev.paid_days || 0) + pay.days, paid_at: new Date().toISOString() }).eq('id', pay.event_id);
  if (e3) throw e3;
  return { already: false, pay };
}
