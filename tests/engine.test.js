import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEngine } from '../src/lib/engine.js';
import { PRESETS } from '../src/lib/presets.js';
import { parseRows } from '../src/lib/importer.js';

const course = PRESETS.seasons;
const P = (id, hi, extra = {}) => ({ id, name: 'Player ' + id, hi, tee: 'wm', gender: 'M', cat: 'open', grp: 1, pair: 'A', status: 'active', ...extra });
const S = (player_id, hole, role, strokes) => ({ player_id, hole, role, strokes });

test('verification: agree, provisional, dispute, committee', () => {
  const E = makeEngine({
    event: { format: 'stableford', settings: { allowance: 100 } }, course,
    players: [P('a', 10)],
    scores: [S('a', 1, 'self', 4), S('a', 1, 'marker', 4), S('a', 2, 'self', 5), S('a', 3, 'self', 4), S('a', 3, 'marker', 6), S('a', 4, 'self', 7), S('a', 4, 'marker', 5), S('a', 4, 'admin', 6)],
  });
  const p = E.active[0];
  assert.equal(E.holeState(p, 1).st, 'verified');
  assert.equal(E.holeState(p, 2).st, 'provisional');
  assert.deepEqual([E.holeState(p, 3).st, E.holeState(p, 3).v], ['disputed', 6]); // higher counts by default
  assert.deepEqual([E.holeState(p, 4).st, E.holeState(p, 4).v], ['official', 6]);
  assert.equal(E.issues().filter((x) => x.kind === 'dispute').length, 1);
});

test('dispute policy hold keeps the hole out', () => {
  const E = makeEngine({ event: { format: 'stableford', settings: { disputePolicy: 'hold' } }, course, players: [P('a', 10)], scores: [S('a', 1, 'self', 4), S('a', 1, 'marker', 5)] });
  assert.equal(E.indCalc(E.active[0]).thru, 0);
});

test('course handicap uses slope and rating; alliance counts best 2, all on par 3', () => {
  const players = [P('a', 8.4), P('b', 15.2), P('c', 22, { tee: 'rl', gender: 'F' }), P('d', 3.1)];
  const scores = [];
  const g = { a: [4, 5, 4, 5, 3], b: [5, 4, 5, 6, 4], c: [5, 5, 6, 6, 3], d: [4, 4, 3, 5, 3] };
  for (const [id, arr] of Object.entries(g)) arr.forEach((v, i) => scores.push(S(id, i + 1, 'self', v)));
  const E = makeEngine({ event: { format: 'alliance', settings: { allowance: 95, count: { base: 2, p3: 0 } } }, course, players, scores });
  assert.deepEqual(E.handicaps(E.active[0]), { ch: 9, ph: 9 });
  assert.deepEqual(E.handicaps(E.active[2]), { ch: 27, ph: 26 });
  const t = E.teamsOf()[0]; const c = E.allianceCalc(t);
  assert.equal(c.holes[4].need, 4); // par 3 hole 5: all count
  assert.equal(c.thru, 5);
});

test('countback: back nine then handicap', () => {
  const E0 = makeEngine({ event: { format: 'stableford', settings: { allowance: 100 } }, course, players: [] });
  const mk = (id, hi, pts) => { const p = P(id, hi); const ph = E0.handicaps(p).ph; return { p, sc: pts.map((pt, i) => S(id, i + 1, 'self', 2 + E0.PAR[i] + (ph >= 0 ? Math.floor(ph / 18) + (E0.SI[i] <= ph % 18 ? 1 : 0) : 0) - pt)) }; };
  const flat = Array(18).fill(2), front = [3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2];
  const a = mk('hi12', 12, flat), b = mk('hi8', 8, flat), c = mk('weak', 5, front);
  const E = makeEngine({ event: { format: 'stableford', settings: { allowance: 100 } }, course, players: [a.p, b.p, c.p], scores: [...a.sc, ...b.sc, ...c.sc] });
  const rows = E.lbModel().rows.map((r) => r.label);
  assert.deepEqual(rows, ['Player hi8', 'Player hi12', 'Player weak']);
});

test('divisions and field', () => {
  const players = [P('a', 4), P('b', 14, { gender: 'F', tee: 'rl' }), P('c', 21, { cat: 'junior' })];
  const E = makeEngine({ event: { format: 'stableford', settings: { divisions: true, field: 'open' } }, course, players });
  assert.deepEqual(E.active.map((p) => E.divOf(p)), ['A', 'B', 'C']);
  const L = makeEngine({ event: { format: 'stableford', settings: { field: 'ladies' } }, course, players });
  assert.deepEqual(L.field.map((p) => p.id), ['b']);
});

test('importer reads Afrikaans headings, plus handicaps and tees', () => {
  const rows = parseRows([['Naam', 'Van', 'Handicap Index', 'Tee', 'Geslag'], ['Pieter', 'Venter', '12,4', 'Wit', 'M'], ['Anna', 'Botha', '+1.2', 'Rooi', 'V']], { tees: course.tees });
  assert.equal(rows[0].name, 'Pieter Venter'); assert.equal(rows[0].hi, 12.4); assert.equal(rows[0].tee, 'wm');
  assert.equal(rows[1].hi, -1.2); assert.equal(rows[1].gender, 'F'); assert.equal(rows[1].tee, 'rl');
  assert.equal(rows[0].grp, 1);
});
