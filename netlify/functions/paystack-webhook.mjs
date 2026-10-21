// POST /.netlify/functions/paystack-webhook — Paystack tells us about payments here.
// Add this URL in Paystack → Settings → API Keys & Webhooks.
import { adminDb, handle, json, markPaid, paystack, verifyPaystack } from '../lib/pay.mjs';

export default handle(async (req) => {
  const raw = await req.text();
  if (!verifyPaystack(raw, req.headers.get('x-paystack-signature'))) return json(400, { error: 'Bad signature' });
  const evt = JSON.parse(raw);
  const db = adminDb();
  if (evt.event === 'charge.success') {
    const ref = evt.data?.reference;
    const t = await paystack(`transaction/verify/${encodeURIComponent(ref)}`); // never trust the webhook body alone
    if (t.status === 'success') await markPaid(db, { ref, payerEmail: t.customer?.email, amountCents: t.amount, currency: (t.currency || 'zar').toLowerCase() });
  }
  if (evt.event === 'refund.processed') {
    const ref = evt.data?.transaction_reference || evt.data?.transaction?.reference;
    if (ref) await db.from('payments').update({ status: 'refunded' }).eq('provider_ref', ref).eq('status', 'paid');
  }
  return json(200, { received: true });
});
