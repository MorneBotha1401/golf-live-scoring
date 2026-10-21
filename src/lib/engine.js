// Scoring engine: formats, handicaps, divisions, verification, ranking and countback.
// Pure functions over one event's data. Nothing here talks to the network.

export const FORMATS = {
  stroke: { label: 'Medal', team: false, help: 'Individual stroke play. Every shot counts; ranked on net or gross.' },
  stableford: { label: 'Individual Stableford', team: false, help: 'Individual points: 2 for a net par, 3 for a net birdie, 1 for a net bogey.' },
  betterball: { label: 'Betterball Stableford', team: true, help: 'Pairs. On each hole the better Stableford score of the two counts.' },
  alliance: { label: '4-ball Alliance', team: true, help: 'The four-ball is the team. On each hole the best Stableford scores count, as many as you set.' },
  scramble: { label: 'American Scramble', team: true, help: 'The team picks the best shot every time and records one score per hole, played off a team handicap.' },
  scramble_drive: { label: 'Scramble drive, own ball', team: true, help: 'The team picks the best drive, then everyone plays their own ball in. Best Stableford scores count, as set.' },
};
export const FIELD = { open: 'Open field', men: 'Men only', ladies: 'Ladies only', juniors: 'Juniors only', seniors: 'Seniors only' };
export const CATS = { all: 'Overall', M: 'Men', F: 'Ladies', junior: 'Juniors', senior: 'Seniors' };
export const TERMS = { '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', '0': 'Par', '1': 'Bogey', '2': 'Double', '3': 'Triple' };

export const DEFAULT_SETTINGS = {
  allowance: 95, basis: 'net', scrScoring: 'net', teamPct: 10, drives: true, minDrives: 3,
  count: { base: 2, p3: null, p4: null, p5: null, holes: null },
  field: 'open', divisions: false, divBy: 'playing', divLimits: { a: 9, b: 19, c: 24 },
  cb2: 'si', disputePolicy: 'higher',
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const first = (n) => String(n || '').trim().split(/\s+/)[0] || '?';
export const shortName = (n) => { const w = String(n || '').trim().split(/\s+/); return w.length > 1 ? w[0] + ' ' + w[w.length - 1][0] : w[0] || '?'; };
export const initials = (n) => String(n || '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const fmtHi = (hi) => { const n = +hi || 0; return n < 0 ? '+' + Math.abs(n).toFixed(1) : n.toFixed(1); };
export const fmtPar = (n) => (n === 0 ? 'E' : n > 0 ? '+' + n : String(n));
export const countWord = (n) => (n === 0 ? 'All scores count' : n === 1 ? '1 score counts' : n + ' scores count');
export function strokesOn(si, ph) { if (ph >= 0) return Math.floor(ph / 18) + (si <= ph % 18 ? 1 : 0); return si > 18 + ph ? -1 : 0; }

// "Worse" score for disputes: a pick-up (0) is worst, otherwise more strokes.
const worse = (a, b) => { const k = (x) => (x === 0 ? 99 : x); return k(a) >= k(b) ? a : b; };

/**
 * Build an engine for one event.
 * data = { event, course, players, scores, teamScores, overlay }
 *  - scores: rows {player_id, hole, role:'self'|'marker'|'admin', strokes}
 *  - teamScores: rows {team_key, hole, strokes, drive_player}
 *  - overlay: unsaved local values { ['p:'+id]: {self:{h5:4}, marker:{h5:4}}, ['t:'+key]: {strokes:{h5:4}, drive:{h5:playerId}} }
 */
export function makeEngine({ event, course, players = [], scores = [], teamScores = [], overlay = {} }) {
  const r = { ...DEFAULT_SETTINGS, ...(event?.settings || {}), count: { ...DEFAULT_SETTINGS.count, ...(event?.settings?.count || {}) }, format: event?.format || 'stableford', name: event?.name, date: event?.event_date };
  const holes = course?.holes || [];
  const PAR = holes.map((h) => +h.par || 4);
  const SI = holes.map((h, i) => +h.si || i + 1);
  const coursePar = PAR.reduce((a, b) => a + b, 0) || 72;
  const TEES = {};
  (course?.tees || []).forEach((t) => { TEES[t.code] = { ...t, y: holes.map((h) => +(h.len?.[t.len] ?? 0)) }; });
  const teeOf = (p) => TEES[p.tee] || Object.values(TEES)[0] || { label: '', cr: coursePar, slope: 113, y: Array(18).fill(0) };

  const all = players.map((p) => ({ ...p, group: p.grp ?? p.group ?? 0 }));
  const active = all.filter((p) => (p.status || 'active') === 'active');

  // index entries
  const entries = {}; // pid -> hole -> {self,marker,admin}
  for (const s of scores) { ((entries[s.player_id] ||= {})[s.hole] ||= {})[s.role] = s.strokes; }
  const tscore = {}; // key -> hole -> {strokes, drive}
  for (const t of teamScores) { (tscore[t.team_key] ||= {})[t.hole] = { strokes: t.strokes, drive: t.drive_player }; }

  const fmt = FORMATS[r.format] ? r.format : 'stableford';
  const basis = r.basis || 'net';
  const isTeam = FORMATS[fmt].team;
  const allianceLike = ['betterball', 'alliance', 'scramble_drive'].includes(fmt);
  const pickupOK = fmt !== 'stroke' && !(fmt === 'scramble' && r.scrScoring !== 'stableford');
  const tracksDrives = ['scramble', 'scramble_drive'].includes(fmt) && r.drives !== false;

  function countFor(i) { if (fmt === 'betterball') return 1; const c = r.count || {}; const h = c.holes?.[i]; if (h != null) return h; const p = c['p' + PAR[i]]; if (p != null) return p; return c.base ?? 2; }
  const ptsFor = (i, s, g) => (g === 0 ? 0 : Math.max(0, 2 + PAR[i] + s - g));
  function handicaps(p) { const t = teeOf(p); const ch = Math.round((+p.hi || 0) * t.slope / 113 + (t.cr - coursePar)); const ph = Math.round(ch * ((r.allowance ?? 100) / 100)); return { ch, ph }; }
  const teamKey = (p) => (fmt === 'betterball' ? String(p.group) + (p.pair || 'A') : String(p.group));

  // ---- verification of a player's hole ----
  function holeState(p, h) {
    const ov = overlay['p:' + p.id];
    const e = { ...(entries[p.id]?.[h] || {}) };
    if (ov) for (const role of ['self', 'marker', 'admin']) { const o = ov[role]; if (o && ('h' + h) in o) { const v = o['h' + h]; if (v == null) delete e[role]; else e[role] = v; } }
    const { self, marker, admin } = e;
    if (admin != null) return { v: admin, st: 'official', self, marker, admin };
    if (self != null && marker != null) {
      if (self === marker) return { v: self, st: 'verified', self, marker };
      return { v: r.disputePolicy === 'hold' ? null : worse(self, marker), st: 'disputed', self, marker };
    }
    if (self != null) return { v: self, st: 'provisional', self };
    if (marker != null) return { v: marker, st: 'provisional', marker };
    return { v: null, st: 'none' };
  }
  const scoreOf = (p, h) => holeState(p, h).v;
  function teamScore(k, h) { const ov = overlay['t:' + k]?.strokes; if (ov && ('h' + h) in ov) return ov['h' + h]; const v = tscore[k]?.[h]?.strokes; return typeof v === 'number' ? v : null; }
  function teamDrive(k, h) { const ov = overlay['t:' + k]?.drive; if (ov && ('h' + h) in ov) return ov['h' + h]; return tscore[k]?.[h]?.drive || null; }

  // ---- field, categories, divisions ----
  const genderOf = (p) => (p.gender === 'F' ? 'F' : 'M');
  const catOf = (p) => (p.cat === 'junior' || p.cat === 'senior' ? p.cat : 'open');
  function eligible(p) { const f = r.field || 'open'; return f === 'open' ? true : f === 'men' ? genderOf(p) === 'M' : f === 'ladies' ? genderOf(p) === 'F' : f === 'juniors' ? catOf(p) === 'junior' : catOf(p) === 'senior'; }
  const inCat = (p, c) => c === 'all' || (c === 'M' || c === 'F' ? genderOf(p) === c : catOf(p) === c);
  const divsOn = ['stroke', 'stableford'].includes(fmt) && !!r.divisions;
  const lim = { a: 9, b: 19, c: 24, ...(r.divLimits || {}) };
  function divOf(p) { const h = r.divBy === 'index' ? Math.round(+p.hi || 0) : handicaps(p).ph; return h <= lim.a ? 'A' : h <= lim.b ? 'B' : h <= lim.c ? 'C' : 'D'; }
  function divRange(d) { return d === 'A' ? `0–${lim.a}` : d === 'B' ? `${lim.a + 1}–${lim.b}` : d === 'C' ? `${lim.b + 1}–${lim.c}` : `${lim.c + 1}+`; }
  const divLabel = (d) => `${d} division (${divRange(d)})`;
  const field = active.filter(eligible);
  const catsPresent = () => (isTeam || (r.field || 'open') !== 'open' ? [] : ['M', 'F', 'junior', 'senior'].filter((c) => field.some((p) => inCat(p, c))));
  const divsPresent = () => (!divsOn ? [] : ['A', 'B', 'C', 'D'].filter((d) => field.some((p) => divOf(p) === d)));

  function teamsOf(list = active) {
    const m = {};
    for (const p of list) { if (!p.group) continue; const k = teamKey(p); (m[k] ||= { key: k, group: p.group, pair: p.pair || 'A', members: [] }).members.push(p); }
    return Object.values(m).map((t) => { t.members.sort((a, b) => a.name.localeCompare(b.name)); t.label = t.members.map((x) => x.name).join(' & '); return t; })
      .sort((a, b) => a.group - b.group || a.key.localeCompare(b.key));
  }
  const teamHcp = (t) => Math.round(t.members.reduce((s, p) => s + handicaps(p).ch, 0) * ((r.teamPct ?? 10) / 100));

  // ---- calculations ----
  function indCalc(p) {
    const { ph } = handicaps(p); let thru = 0, gross = 0, par = 0, st = 0, pts = 0, nr = false;
    const hm = Array(18).fill(null), hp = Array(18).fill(null), states = [];
    for (let i = 0; i < 18; i++) {
      const hs = holeState(p, i + 1); states[i] = hs; const g = hs.v; if (g == null) continue;
      const s = strokesOn(SI[i], ph); thru++; const pt = ptsFor(i, s, g); pts += pt; hp[i] = pt;
      if (g === 0) nr = true; else { gross += g; par += PAR[i]; st += s; }
      hm[i] = fmt === 'stroke' ? (basis === 'gross' ? g - PAR[i] : g - s - PAR[i]) : pt;
    }
    const toPar = gross - par, net = gross - st - par;
    const primary = fmt === 'stroke' ? (basis === 'gross' ? toPar : net) : pts;
    const disputes = states.filter((s) => s?.st === 'disputed').length;
    const verified = states.filter((s) => s && (s.st === 'verified' || s.st === 'official')).length;
    return { ph, thru, gross, toPar, net, pts, nr, hm, hp, states, disputes, verified, primary, dir: fmt === 'stroke' ? -1 : 1, hc1: ph, hc2: +p.hi || 0 };
  }
  function allianceCalc(t) {
    const ph = {}; t.members.forEach((p) => (ph[p.id] = handicaps(p).ph)); let total = 0, thru = 0, disputes = 0; const hm = Array(18).fill(null), hl = [];
    for (let i = 0; i < 18; i++) {
      const list = [];
      for (const p of t.members) { const hs = holeState(p, i + 1); if (hs.st === 'disputed') disputes++; const g = hs.v; if (g == null) continue; list.push({ id: p.id, pt: ptsFor(i, strokesOn(SI[i], ph[p.id]), g) }); }
      const n = countFor(i), need = n === 0 ? t.members.length : Math.min(n, t.members.length); list.sort((a, b) => b.pt - a.pt);
      const used = list.slice(0, need); const hp = used.reduce((s, x) => s + x.pt, 0);
      hl[i] = { counted: new Set(used.map((x) => x.id)), pts: hp, need };
      if (list.length) { hm[i] = hp; total += hp; }
      if (t.members.length && list.length === t.members.length) thru++;
    }
    return { ph, thru, pts: total, hm, holes: hl, disputes, primary: total, dir: 1, hc1: t.members.reduce((s, p) => s + ph[p.id], 0), hc2: t.members.reduce((s, p) => s + (+p.hi || 0), 0) };
  }
  function scrambleCalc(t) {
    const th = teamHcp(t); const stab = r.scrScoring === 'stableford'; let thru = 0, gross = 0, par = 0, st = 0, pts = 0;
    const hm = Array(18).fill(null), hp = Array(18).fill(null);
    for (let i = 0; i < 18; i++) {
      const g = teamScore(t.key, i + 1); if (g == null) continue; const s = strokesOn(SI[i], th); thru++; const pt = ptsFor(i, s, g); pts += pt; hp[i] = pt;
      if (g > 0) { gross += g; par += PAR[i]; st += s; } hm[i] = stab ? pt : g > 0 ? g - s - PAR[i] : null;
    }
    const net = gross - st - par;
    return { th, thru, gross, toPar: gross - par, net, pts, hm, hp, disputes: 0, primary: stab ? pts : net, dir: stab ? 1 : -1, hc1: th, hc2: t.members.reduce((s, p) => s + (+p.hi || 0), 0) };
  }
  function driveCounts(t) { const c = {}; t.members.forEach((p) => (c[p.id] = 0)); for (let h = 1; h <= 18; h++) { const d = teamDrive(t.key, h); if (d in c) c[d]++; } return c; }

  // ---- ranking and countback ----
  const byHole = r.cb2 === 'holes';
  const cbText = `Ties: best back 9, then best ${byHole ? 'odd-numbered holes' : 'odd stroke-index holes'}, then lowest handicap`;
  function tieBreak(a, b) {
    const dir = a.c.dir;
    const back = (x) => x.c.hm.slice(9).reduce((s, v) => s + (v || 0), 0);
    const odd = (x) => x.c.hm.reduce((s, v, i) => s + (((byHole ? i + 1 : SI[i]) % 2) ? v || 0 : 0), 0);
    let e = (back(b) - back(a)) * dir; if (e) return [e, 'back 9'];
    e = (odd(b) - odd(a)) * dir; if (e) return [e, byHole ? 'odd holes' : 'odd SI holes'];
    e = a.c.hc1 - b.c.hc1; if (e) return [e, 'lower handicap'];
    e = a.c.hc2 - b.c.hc2; if (e) return [e, 'lower handicap'];
    return [0, ''];
  }
  function rank(rows) {
    const cmp = (a, b) => {
      if (!a.c.thru || !b.c.thru) return (a.c.thru ? 0 : 1) - (b.c.thru ? 0 : 1);
      const d = (b.c.primary - a.c.primary) * a.c.dir; if (d) return d;
      if (a.c.thru === 18 && b.c.thru === 18) return tieBreak(a, b)[0]; return 0;
    };
    rows.sort((a, b) => cmp(a, b) || b.c.thru - a.c.thru || a.label.localeCompare(b.label));
    rows.forEach((x, i) => { x.pos = !x.c.thru ? null : i && cmp(rows[i - 1], x) === 0 ? rows[i - 1].pos : i + 1; });
    rows.forEach((x) => { x.tie = x.pos != null && rows.filter((y) => y.pos === x.pos).length > 1; });
    rows.forEach((x, i) => { const y = rows[i + 1]; if (y && x.c.thru === 18 && y.c.thru === 18 && x.c.primary === y.c.primary) { const [e, why] = tieBreak(x, y); if (e < 0) { x.cb = why; y.cbLost = why; } } });
    return rows;
  }

  function boardRows(flt = {}) {
    const cat = flt.cat || 'all', dv = flt.div || 'all';
    const ps = field.filter((p) => inCat(p, cat) && (dv === 'all' || !divsOn || divOf(p) === dv));
    if (!isTeam) return ps.map((p) => ({ id: 'p:' + p.id, label: p.name, p, c: indCalc(p) }));
    return teamsOf(ps).map((t) => ({ id: 't:' + t.key, label: t.label, t, c: fmt === 'scramble' ? scrambleCalc(t) : allianceCalc(t) }));
  }
  function fltLabel(flt = {}) { const a = []; if (flt.cat && flt.cat !== 'all') a.push(CATS[flt.cat]); if (flt.div && flt.div !== 'all' && divsOn) a.push(divLabel(flt.div)); return a.join(' · '); }

  function lbModel(flt = {}) {
    let heads;
    if (fmt === 'stroke') heads = ['Thru', basis === 'gross' ? 'Net' : 'Gross', basis === 'gross' ? 'Gross' : 'Net'];
    else if (fmt === 'stableford') heads = ['Thru', 'Gross', 'Pts'];
    else if (fmt === 'scramble') heads = ['Thru', 'Gross', r.scrScoring === 'stableford' ? 'Pts' : 'Net'];
    else heads = ['Thru', null, 'Pts'];
    const tp = (c, v) => (c.thru ? { t: fmtPar(v), u: v < 0 } : { t: '–', u: false });
    const pt = (c) => ({ t: String(c.pts), u: false });
    const rows = rank(boardRows(flt)).map((x) => {
      const c = x.c; let sub, hc = '', second = { t: '', u: false }, main;
      if (!isTeam) {
        hc = String(c.ph); sub = `HI ${fmtHi(x.p.hi)} · HC ${c.ph} · ${teeOf(x.p).label || ''}${x.p.group ? ' · Grp ' + x.p.group : ''}`;
        if (divsOn) x.div = divOf(x.p);
        if (fmt === 'stroke') { const g = basis === 'gross'; second = tp(c, g ? c.net : c.toPar); main = tp(c, g ? c.toPar : c.net); }
        else { second = c.nr ? { t: 'NR', u: false } : tp(c, c.toPar); main = pt(c); }
      } else if (fmt === 'scramble') { hc = String(c.th); sub = `Group ${x.t.group} · team HC ${c.th}`; second = tp(c, c.toPar); main = r.scrScoring === 'stableford' ? pt(c) : tp(c, c.net); }
      else { sub = (fmt === 'betterball' ? `Group ${x.t.group} · Pair ${x.t.pair}` : `Group ${x.t.group}`) + ' · HC ' + x.t.members.map((p) => handicaps(p).ph).join('/'); main = pt(c); }
      if (x.cb) sub += ` · won countback on ${x.cb}`; else if (x.cbLost) sub += ` · lost countback on ${x.cbLost}`;
      if (c.disputes) sub += ` · ${c.disputes} disputed`;
      const signed = x.p ? !!x.p.attested_at : x.t ? x.t.members.every((m) => m.attested_at) : false;
      return { id: x.id, x, div: x.div || '', pos: x.pos ? (x.tie ? 'T' : '') + x.pos : '–', label: x.label || 'Empty team', sub, hc, thru: c.thru === 18 ? 'F' : String(c.thru || '–'), second, main, disputes: c.disputes || 0, signed };
    });
    return { heads, rows, team: isTeam, flabel: fltLabel(flt) };
  }

  function describe() {
    const al = `${r.allowance ?? 100}% allowance`;
    let s = fmt === 'stroke' ? `Medal · ${basis === 'gross' ? 'gross' : 'net'} · ${al}` : fmt === 'stableford' ? `Individual Stableford · ${al}` : fmt === 'betterball' ? `Betterball Stableford · ${al}` :
      fmt === 'scramble' ? `American Scramble · ${r.scrScoring === 'stableford' ? 'Stableford points' : 'net strokes'} · team handicap ${r.teamPct ?? 10}% of combined` : `${FORMATS[fmt].label} · ${countText()} · ${al}`;
    if (tracksDrives && (r.minDrives || 0) > 0) s += ` · min ${r.minDrives} drives each`;
    if ((r.field || 'open') !== 'open') s += ` · ${FIELD[r.field].toLowerCase()}`;
    if (divsOn) s += ` · A/B/C divisions on ${r.divBy === 'index' ? 'index' : 'playing handicap'}`;
    return s;
  }
  function countText() {
    const c = r.count || {}; if (c.holes && c.holes.some((v) => v != null)) return 'count set per hole';
    const b = c.base ?? 2; let s = countWord(b).toLowerCase();
    [3, 4, 5].forEach((p) => { const v = c['p' + p]; if (v != null && v !== b) s += `, ${v === 0 ? 'all' : v} on par ${p}s`; });
    return s;
  }

  // ---- committee: problems that need attention ----
  function issues() {
    const out = [];
    for (const p of active) {
      for (let h = 1; h <= 18; h++) { const s = holeState(p, h); if (s.st === 'disputed') out.push({ kind: 'dispute', p, h, self: s.self, marker: s.marker }); }
      const st = Array.from({ length: 18 }, (_, i) => holeState(p, i + 1));
      const n = st.filter((s) => s.v != null).length;
      st.forEach((s, i) => {
        const v = s.v; if (v == null || v === 0) return;
        if (v === 1 && PAR[i] >= 4) out.push({ kind: 'check', p, h: i + 1, msg: `Hole in one on a par ${PAR[i]}` });
        if (v >= PAR[i] + 6) out.push({ kind: 'check', p, h: i + 1, msg: `${v} on a par ${PAR[i]}` });
      });
      const gaps = st.map((s, i) => (s.v == null && st.slice(i + 1).some((x) => x.v != null) ? i + 1 : null)).filter(Boolean);
      if (gaps.length && !isTeam) out.push({ kind: 'gap', p, msg: `Missing hole${gaps.length > 1 ? 's' : ''} ${gaps.join(', ')}` });
      if (n === 18 && !p.signed_at && fmt !== 'scramble') out.push({ kind: 'unsigned', p, msg: 'Finished but card not signed' });
      if (p.signed_at && !p.attested_at && fmt !== 'scramble') out.push({ kind: 'unattested', p, msg: 'Signed, waiting for marker to attest' });
    }
    return out;
  }

  return {
    r, fmt, basis, isTeam, allianceLike, pickupOK, tracksDrives, PAR, SI, TEES, coursePar, holes, players: all, active, field,
    teeOf, countFor, ptsFor, handicaps, teamKey, holeState, scoreOf, teamScore, teamDrive, entries,
    genderOf, catOf, eligible, inCat, divsOn, divOf, divLabel, divRange, catsPresent, divsPresent,
    teamsOf, teamHcp, indCalc, allianceCalc, scrambleCalc, driveCounts, rank, lbModel, describe, countText, cbText, issues,
  };
}
