// Sample event for the public demo: a stableford golf day with divisions, playing live.
import { PRESETS } from './presets.js';

const NAMES = ['Thabo Nkosi', 'Annelie du Toit', 'James Carter', 'Priya Naidoo', 'Pieter Venter', 'Lerato Mokoena', 'Sean O\'Brien', 'Marike Botes',
  'David Kim', 'Zanele Dube', 'Ruan Steyn', 'Emma Clarke', 'Kagiso Molefe', 'Sarah Jacobs', 'Willem Pretorius', 'Fatima Patel',
  'Johan Kruger', 'Nadia Hendricks', 'Chris Adams', 'Lindiwe Zulu', 'Henk Smit', 'Grace Okafor', 'Tom Walsh', 'Carla Fourie'];
const HI = [4.2, 18.6, 11.3, 24.1, 7.8, 21.4, 14.9, 9.6, 2.1, 26.3, 12.7, 16.4, 19.8, 8.4, 5.5, 22.7, 13.2, 17.1, 10.4, 23.9, 6.3, 15.6, 20.2, 3.7];

export const demoCourse = { id: 'demo-course', ...PRESETS.seasons };
export const demoClub = { id: 'demo-club', name: 'Demo Golf Day', logo_url: null };
export const demoEvent = {
  id: 'demo', slug: 'demo', name: 'Sunshine Charity Golf Day', event_date: new Date().toISOString().slice(0, 10), status: 'live',
  format: 'stableford', settings: { allowance: 95, divisions: true, divBy: 'playing', divLimits: { a: 9, b: 19, c: 24 }, field: 'open' },
  sponsors: [{ name: 'Your sponsor here' }],
};
export const demoPlayers = NAMES.map((name, i) => ({
  id: 'd' + i, name, hi: HI[i], gender: /Annelie|Priya|Lerato|Marike|Zanele|Emma|Sarah|Fatima|Nadia|Lindiwe|Grace|Carla/.test(name) ? 'F' : 'M',
  cat: i % 7 === 3 ? 'senior' : i % 9 === 5 ? 'junior' : 'open', tee: '', grp: Math.floor(i / 4) + 1, pair: i % 4 < 2 ? 'A' : 'B', status: 'active',
})).map((p) => ({ ...p, tee: p.gender === 'F' ? 'rl' : 'wm' }));

// Seeded random so the demo looks the same on every load.
function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const rand = rng(42);

// A believable gross score: par plus a few strokes, more for higher handicaps.
export function sampleScore(par, si, hi) {
  const shots = Math.max(0, Math.round(hi * 0.95)); const recv = Math.floor(shots / 18) + (si <= shots % 18 ? 1 : 0);
  const r = rand(); const delta = r < 0.08 ? -1 : r < 0.42 ? 0 : r < 0.78 ? 1 : r < 0.94 ? 2 : 3;
  return Math.max(1, par + Math.round(recv * 0.7) + delta - (hi < 6 && r < 0.2 ? 1 : 0));
}

/** Starting position: each four-ball is part way round. */
export function initialDemoScores() {
  const start = [11, 9, 8, 6, 4, 2];
  const scores = [];
  demoPlayers.forEach((p) => {
    const holes = start[p.grp - 1] || 0;
    for (let h = 1; h <= holes; h++) {
      const hole = demoCourse.holes[h - 1];
      const v = sampleScore(hole.par, hole.si, p.hi);
      scores.push({ player_id: p.id, hole: h, role: 'self', strokes: v }, { player_id: p.id, hole: h, role: 'marker', strokes: v });
    }
  });
  return scores;
}

/** Next hole for one group (the one furthest behind); returns new score rows. */
export function nextDemoHole(scores) {
  const thru = {}; demoPlayers.forEach((p) => (thru[p.grp] = 0));
  scores.forEach((s) => { const p = demoPlayers.find((x) => x.id === s.player_id); if (p) thru[p.grp] = Math.max(thru[p.grp], s.hole); });
  const open = Object.entries(thru).filter(([, h]) => h < 18).sort((a, b) => a[1] - b[1]);
  if (!open.length) return null;
  const [grp, h0] = open[Math.floor(rand() * Math.min(3, open.length))];
  const h = +h0 + 1; const hole = demoCourse.holes[h - 1];
  return demoPlayers.filter((p) => p.grp === +grp).flatMap((p) => { const v = sampleScore(hole.par, hole.si, p.hi); return [{ player_id: p.id, hole: h, role: 'self', strokes: v }, { player_id: p.id, hole: h, role: 'marker', strokes: v }]; });
}
