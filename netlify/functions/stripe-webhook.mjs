// POST /.netlify/functions/stripe-webhook  — Stripe tells us about payments here.
// Add this URL in Stripe → Developers → Webhooks with the events
// checkout.session.completed, checkout.session.async_payment_succeeded and charge.refunded.
import { adminDb, handle, json, markPaid, stripe, verifyStripe } from '../lib/pay.mjs';

const env = (k) => (typeof Netlify !== 'undefined' && Netlify.env?.get(k)) || process.env[k] || '';

export default handle(async (req) => {
  const raw = await req.text();
  if (!verifyStripe(raw, req.headers.get('stripe-signature'), env('STRIPE_WEBHOOK_SECRET'))) return json(400, { error: 'Bad signature' });
  const evt = JSON.parse(raw);
  const db = adminDb();
  const obj = evt.data?.object || {};

  if ((evt.type === 'checkout.session.completed' || evt.type === 'checkout.session.async_payment_succeeded') && obj.payment_status === 'paid') {
    let receiptUrl = null;
    try {
      if (obj.payment_intent) { const pi = await stripe(`payment_intents/${obj.payment_intent}?expand[]=latest_charge`); receiptUrl = pi.latest_charge?.receipt_url || null; }
    } catch { /* receipt link is a nice-to-have */ }
    const r = await markPaid(db, { ref: obj.id, payerEmail: obj.customer_details?.email, amountCents: obj.amount_total, currency: obj.currency, receiptUrl });
    return json(200, { received: true, unlocked: !r.already });
  }

  if (evt.type === 'charge.refunded' && obj.payment_intent) {
    const list = await stripe(`checkout/sessions?payment_intent=${obj.payment_intent}&limit=1`);
    const ref = list.data?.[0]?.id;
    if (ref && obj.refunded) {
      const { data: pay } = await db.from('payments').select('*').eq('provider_ref', ref).maybeSingle();
      if (pay && pay.status === 'paid') {
        await db.from('payments').update({ status: 'refunded' }).eq('id', pay.id);
        const { data: ev } = await db.from('events').select('paid_days,status').eq('id', pay.event_id).single();
        if (ev && ev.status === 'draft') await db.from('events').update({ paid_days: Math.max(0, (ev.paid_days || 0) - pay.days) }).eq('id', pay.event_id);
      }
    }
    return json(200, { received: true });
  }
  return json(200, { received: true, ignored: evt.type });
});
