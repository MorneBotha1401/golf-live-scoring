// GET /.netlify/functions/confirm-payment?ref=…  (Authorization: Bearer <organiser token>)
// Called when the organiser returns from the payment page. Checks with the gateway
// and unlocks the event straight away, so it works even if a webhook is delayed.
import { adminDb, handle, HttpError, json, markPaid, paystack, stripe, userDb } from '../lib/pay.mjs';

export default handle(async (req) => {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const ref = new URL(req.url).searchParams.get('ref');
  if (!token || !ref) throw new HttpError(400, 'Missing details');
  const db = adminDb();
  const { data: pay } = await db.from('payments').select('*').eq('provider_ref', ref).maybeSingle();
  if (!pay) throw new HttpError(404, 'Payment not found');
  const { data: isAdmin } = await userDb(token).rpc('is_event_admin', { p_event: pay.event_id });
  if (!isAdmin) throw new HttpError(403, "You're not an admin of this event");
  if (pay.status === 'paid') return json(200, { paid: true });

  if (pay.provider === 'stripe') {
    const s = await stripe(`checkout/sessions/${encodeURIComponent(ref)}?expand[]=payment_intent.latest_charge`);
    if (s.payment_status !== 'paid') return json(200, { paid: false, status: s.payment_status });
    await markPaid(db, { ref, payerEmail: s.customer_details?.email, amountCents: s.amount_total, currency: s.currency, receiptUrl: s.payment_intent?.latest_charge?.receipt_url });
    return json(200, { paid: true });
  }
  if (pay.provider === 'paystack') {
    const t = await paystack(`transaction/verify/${encodeURIComponent(ref)}`);
    if (t.status !== 'success') return json(200, { paid: false, status: t.status });
    await markPaid(db, { ref, payerEmail: t.customer?.email, amountCents: t.amount, currency: (t.currency || 'zar').toLowerCase() });
    return json(200, { paid: true });
  }
  return json(200, { paid: false });
});
