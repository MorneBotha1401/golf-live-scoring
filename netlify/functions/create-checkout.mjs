// POST /.netlify/functions/create-checkout  { eventId, gateway? }  (Authorization: Bearer <organiser token>)
// Creates a checkout for the unpaid days of an event and returns the payment page URL.
import { adminDb, countryOf, gatewaysFor, handle, HttpError, json, paystack, siteUrl, stripe, userDb } from '../lib/pay.mjs';

const fmtDate = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default handle(async (req, context) => {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Sign in first');
  const { eventId, gateway } = await req.json().catch(() => ({}));
  if (!eventId) throw new HttpError(400, 'Which event?');

  const db = adminDb();
  const { data: u, error: ue } = await db.auth.getUser(token);
  if (ue || !u?.user || u.user.is_anonymous) throw new HttpError(401, 'Sign in with your email first');
  const { data: isAdmin } = await userDb(token).rpc('is_event_admin', { p_event: eventId });
  if (!isAdmin) throw new HttpError(403, "You're not an admin of this event");

  const { data: ev, error: ee } = await db.from('events').select('id,name,event_date,days,paid_days,club_id,status').eq('id', eventId).single();
  if (ee || !ev) throw new HttpError(404, 'Event not found');
  const { data: s } = await db.from('app_settings').select('*').eq('id', 1).single();
  const { data: club } = await db.from('clubs').select('plan,name').eq('id', ev.club_id).single();
  if (s?.free_mode || club?.plan === 'comp') throw new HttpError(400, 'This event is free. No payment needed.');
  const days = Math.max(0, (ev.days || 1) - (ev.paid_days || 0));
  if (!days) throw new HttpError(400, 'This event is already paid for');

  const country = countryOf(req, context);
  const allowed = gatewaysFor(country, s?.routes);
  if (!allowed.length) throw new HttpError(503, "Online payments aren't switched on yet. Please try again later.");
  const gw = allowed.includes(gateway) ? gateway : allowed[0];
  const site = siteUrl(req);
  const back = `${site}/admin/event/${ev.id}`;
  const label = `${ev.name} · ${fmtDate(ev.event_date)}${ev.days > 1 ? ` (${ev.days} days)` : ''}`;

  if (gw === 'stripe') {
    const currency = s?.currency || 'usd';
    const unit = s?.price_cents ?? 5000;
    const session = await stripe('checkout/sessions', {
      mode: 'payment',
      customer_email: u.user.email,
      client_reference_id: ev.id,
      line_items: { 0: { quantity: days, price_data: { currency, unit_amount: unit, product_data: { name: 'Event day pass: live golf scoring', description: label } } } },
      metadata: { event_id: ev.id, club_id: ev.club_id, days },
      payment_intent_data: { metadata: { event_id: ev.id }, description: `Event day pass · ${label}` },
      invoice_creation: { enabled: true, invoice_data: { description: `Live golf scoring · ${label}`, metadata: { event_id: ev.id } } },
      allow_promotion_codes: true,
      success_url: `${back}?paid={CHECKOUT_SESSION_ID}#setup`,
      cancel_url: `${back}?cancelled=1#setup`,
    });
    const { error } = await db.from('payments').insert({ event_id: ev.id, club_id: ev.club_id, provider: 'stripe', provider_ref: session.id, days, amount_cents: unit * days, currency, payer_email: u.user.email, country, created_by: u.user.id });
    if (error) throw error;
    return json(200, { url: session.url, gateway: gw });
  }

  if (gw === 'paystack') {
    const unit = s?.price_zar_cents ?? 90000;
    const reference = `ev_${ev.id.slice(0, 8)}_${Date.now().toString(36)}`;
    const init = await paystack('transaction/initialize', {
      email: u.user.email, amount: unit * days, currency: 'ZAR', reference,
      callback_url: `${back}?paid=${reference}#setup`,
      metadata: { event_id: ev.id, club_id: ev.club_id, days, custom_fields: [{ display_name: 'Event', variable_name: 'event', value: label }] },
    });
    const { error } = await db.from('payments').insert({ event_id: ev.id, club_id: ev.club_id, provider: 'paystack', provider_ref: reference, days, amount_cents: unit * days, currency: 'zar', payer_email: u.user.email, country, created_by: u.user.id });
    if (error) throw error;
    return json(200, { url: init.authorization_url, gateway: gw });
  }
  throw new HttpError(400, 'Unknown payment method');
});
