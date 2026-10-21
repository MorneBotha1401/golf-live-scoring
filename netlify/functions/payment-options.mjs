// GET /.netlify/functions/payment-options  → price, the visitor's country and the gateways to offer.
import { adminDb, countryOf, gatewaysFor, GATEWAYS, handle, json } from '../lib/pay.mjs';

export default handle(async (req, context) => {
  const db = adminDb();
  const { data: s } = await db.from('app_settings').select('*').eq('id', 1).single();
  const country = countryOf(req, context);
  const list = gatewaysFor(country, s?.routes);
  return json(200, {
    country,
    free: !!s?.free_mode,
    price: { cents: s?.price_cents ?? 5000, currency: s?.currency || 'usd', zarCents: s?.price_zar_cents ?? 90000 },
    gateways: list.map((id) => ({ id, label: GATEWAYS[id].label, currency: id === 'paystack' ? 'zar' : s?.currency || 'usd' })),
  });
});
