// Browser side of payments: talks to the Netlify functions, never to Stripe directly.
import { supabase } from './supabase.js';

const base = '/.netlify/functions/';
async function token() { const { data } = await supabase.auth.getSession(); return data.session?.access_token; }
async function call(path, opts = {}) {
  const r = await fetch(base + path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}), Authorization: `Bearer ${await token()}` } });
  let body = {}; try { body = await r.json(); } catch { /* no body */ }
  if (!r.ok) throw new Error(body.error || "The payment service isn't reachable right now. Try again in a minute.");
  return body;
}
export const paymentOptions = () => call('payment-options');
export async function startCheckout(eventId, gateway) {
  const { url } = await call('create-checkout', { method: 'POST', body: JSON.stringify({ eventId, gateway }) });
  window.location.assign(url);
}
export const confirmPayment = (ref) => call('confirm-payment?ref=' + encodeURIComponent(ref));
