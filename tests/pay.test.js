import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyStripe, verifyPaystack, gatewaysFor, markPaid } from '../netlify/lib/pay.mjs';

test('Stripe signatures: valid, tampered, stale', () => {
  const secret = 'whsec_test'; const body = '{"id":"evt_1"}'; const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  assert.equal(verifyStripe(body, `t=${t},v1=${sig}`, secret), true);
  assert.equal(verifyStripe(body + ' ', `t=${t},v1=${sig}`, secret), false);
  assert.equal(verifyStripe(body, `t=${t - 3600},v1=${crypto.createHmac('sha256', secret).update(`${t - 3600}.${body}`).digest('hex')}`, secret), false);
  assert.equal(verifyStripe(body, null, secret), false);
});

test('Paystack signatures', () => {
  const secret = 'sk_test_x'; const body = '{"event":"charge.success"}';
  const sig = crypto.createHmac('sha512', secret).update(body).digest('hex');
  assert.equal(verifyPaystack(body, sig, secret), true);
  const bad = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
  assert.equal(verifyPaystack(body, bad, secret), false);
});

test('gateway routing by country', () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test'; delete process.env.PAYSTACK_SECRET_KEY;
  const routes = { default: 'stripe', ZA: 'paystack' };
  assert.deepEqual(gatewaysFor('ZA', routes), ['stripe']); // Paystack not switched on yet
  process.env.PAYSTACK_SECRET_KEY = 'sk_ps';
  assert.deepEqual(gatewaysFor('ZA', routes), ['paystack', 'stripe']);
  assert.deepEqual(gatewaysFor('US', routes), ['stripe', 'paystack']);
  delete process.env.STRIPE_SECRET_KEY; delete process.env.PAYSTACK_SECRET_KEY;
  assert.deepEqual(gatewaysFor('US', routes), []);
});

// Tiny stand-in for the database client, enough for markPaid.
function fakeDb(state) {
  return {
    from(table) {
      const q = { table, filters: [], patch: null, op: 'select' };
      const rows = () => state[table].filter((r) => q.filters.every(([k, v]) => r[k] === v));
      const api = {
        select() { return api; },
        update(p) { q.op = 'update'; q.patch = p; return api; },
        eq(k, v) { q.filters.push([k, v]); return api; },
        maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
        single: async () => ({ data: rows()[0], error: null }),
        then(res) {
          if (q.op === 'update') { const hit = rows(); hit.forEach((r) => Object.assign(r, q.patch)); return res({ data: hit.map((r) => ({ id: r.id })), error: null }); }
          return res({ data: rows(), error: null });
        },
      };
      return api;
    },
  };
}

test('markPaid unlocks once, even when the webhook is delivered twice', async () => {
  const state = { payments: [{ id: 'p1', provider_ref: 'cs_1', event_id: 'e1', days: 2, amount_cents: 10000, status: 'pending' }], events: [{ id: 'e1', paid_days: 0 }] };
  const db = fakeDb(state);
  const a = await markPaid(db, { ref: 'cs_1', amountCents: 10000 });
  const b = await markPaid(db, { ref: 'cs_1', amountCents: 10000 });
  assert.equal(a.already, false); assert.equal(b.already, true);
  assert.equal(state.events[0].paid_days, 2);
  assert.equal(state.payments[0].status, 'paid');
});

test('markPaid refuses an underpayment', async () => {
  const state = { payments: [{ id: 'p1', provider_ref: 'cs_2', event_id: 'e1', days: 1, amount_cents: 5000, status: 'pending' }], events: [{ id: 'e1', paid_days: 0 }] };
  await assert.rejects(markPaid(fakeDb(state), { ref: 'cs_2', amountCents: 100 }));
  assert.equal(state.events[0].paid_days, 0);
});
