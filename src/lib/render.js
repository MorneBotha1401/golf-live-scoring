// HTML renderers for read-only scorecards. Every dynamic value goes through esc().
import { esc, first, shortName, initials, strokesOn, fmtHi } from './engine.js';

export function mark(E, g, i) {
  if (g == null) return '';
  if (g === 0) return '<i class="mk">P</i>';
  const d = g - E.PAR[i];
  const c = d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 1 ? 'bogey' : d >= 2 ? 'dbl' : '';
  return `<i class="mk ${c}">${g}</i>`;
}
const cells = (fn, a, b) => { let s = ''; for (let k = a; k < b; k++) s += fn(k); return s; };
const sumv = (arr, a, b) => { let s = 0, any = false; for (let k = a; k < b; k++) if (arr[k] != null) { s += arr[k]; any = true; } return any ? s : ''; };
const scHead = () => `<thead><tr><th class="lab">Hole</th>${cells((k) => `<th>${k + 1}</th>`, 0, 9)}<th>Out</th>${cells((k) => `<th>${k + 1}</th>`, 9, 18)}<th>In</th><th>Tot</th></tr></thead>`;
function scRow(lab, fn, arr, cls = '') {
  const o = arr ? sumv(arr, 0, 9) : '', i = arr ? sumv(arr, 9, 18) : '', t = arr ? sumv(arr, 0, 18) : '';
  return `<tr class="${cls}"><td class="lab">${lab}</td>${cells(fn, 0, 9)}<td class="tot">${o}</td>${cells(fn, 9, 18)}<td class="tot">${i}</td><td class="tot">${t}</td></tr>`;
}
const grossArr = (get) => Array.from({ length: 18 }, (_, k) => { const g = get(k + 1); return g > 0 ? g : null; });
const netCell = (g, s) => (g == null ? '' : g === 0 ? 'P' : g - s);
const STATUS = { verified: ['✓', 'ok', 'Player and marker agree'], official: ['★', 'ok', 'Set by the committee'], disputed: ['!', 'bad', 'Player and marker disagree'], provisional: ['·', 'pend', 'Waiting for the marker'], none: ['', '', ''] };

function playerHead(E, p) {
  const t = E.teeOf(p), { ch, ph } = E.handicaps(p);
  return `<div class="cardhead"><b>${esc(p.name)}</b><span>${esc(t.label)} tee · course rating ${t.cr} · slope ${t.slope}</span><span>Handicap index ${fmtHi(p.hi)} → course HC ${ch} → playing HC ${ph}${E.fmt === 'scramble' ? '' : ` (${E.r.allowance ?? 100}% allowance)`}</span>${signLine(p)}</div>`;
}
function signLine(p) {
  if (p.attested_at) return '<span class="okc">Card signed and attested</span>';
  if (p.signed_at) return '<span>Signed by player · waiting for marker to attest</span>';
  return '';
}
const metresRow = (E, p) => { const t = E.teeOf(p); return scRow('Metres', (k) => `<td>${t.y[k] || ''}</td>`, t.y); };

export function indCard(E, p, c) {
  const net = Array.from({ length: 18 }, (_, k) => { const g = E.scoreOf(p, k + 1); return g > 0 ? g - strokesOn(E.SI[k], c.ph) : null; });
  return `${playerHead(E, p)}<div class="sc-scroll"><table class="sc num">${scHead()}<tbody>
  ${metresRow(E, p)}
  ${scRow('Par', (k) => `<td>${E.PAR[k]}</td>`, E.PAR)}
  ${scRow('Stroke idx', (k) => `<td>${E.SI[k]}</td>`)}
  ${scRow('Shots rec.', (k) => { const s = strokesOn(E.SI[k], c.ph); return `<td class="dots">${s > 0 ? '•'.repeat(s) : s < 0 ? '+' : ''}</td>`; })}
  ${scRow('Gross', (k) => `<td>${mark(E, E.scoreOf(p, k + 1), k)}</td>`, grossArr((h) => E.scoreOf(p, h)))}
  ${scRow('Net', (k) => `<td>${netCell(E.scoreOf(p, k + 1), strokesOn(E.SI[k], c.ph))}</td>`, net)}
  ${scRow('Points', (k) => `<td>${c.hp[k] ?? ''}</td>`, c.hp, 'teamrow')}
  ${scRow('Checked', (k) => { const s = c.states[k]; const [t, cl, tip] = STATUS[s?.st || 'none']; const extra = s?.st === 'disputed' ? ` title="Player ${s.self}, marker ${s.marker}"` : tip ? ` title="${tip}"` : ''; return `<td class="vs ${cl}"${extra}>${t}</td>`; })}
  </tbody></table></div><p class="note cardnote">✓ player and marker agree · ★ committee · ! disagreement · · waiting for marker</p>`;
}

export function allianceCard(E, t, c) {
  const ph = c.ph;
  const rows = t.members.map((p) => {
    const hp = Array.from({ length: 18 }, (_, k) => (c.holes[k].counted.has(p.id) ? E.ptsFor(k, strokesOn(E.SI[k], ph[p.id]), E.scoreOf(p, k + 1)) : null));
    return scRow(`${esc(shortName(p.name))} <span class="pt">HC ${ph[p.id]}</span>`, (k) => {
      const hs = E.holeState(p, k + 1); const g = hs.v; if (g == null) return hs.st === 'disputed' ? '<td class="vs bad" title="Disputed">!</td>' : '<td></td>';
      const s = strokesOn(E.SI[k], ph[p.id]); const pt = E.ptsFor(k, s, g);
      return `<td class="${c.holes[k].counted.has(p.id) ? 'cnt' : ''}${hs.st === 'disputed' ? ' disp' : ''}">${mark(E, g, k)}<span class="pt">${g > 0 ? 'n' + (g - s) + ' · ' : ''}${pt}p</span></td>`;
    }, hp);
  }).join('');
  const drv = E.tracksDrives ? scRow('Drive', (k) => { const d = E.teamDrive(t.key, k + 1); const p = t.members.find((m) => m.id === d); return `<td>${p ? esc(initials(p.name)) : ''}</td>`; }) : '';
  const head = `<div class="cardhead">${t.members.map((p) => { const tt = E.teeOf(p), { ch } = E.handicaps(p); return `<span><b>${esc(p.name)}</b> · ${esc(tt.label)} · HI ${fmtHi(p.hi)} → course HC ${ch} → playing HC ${ph[p.id]}</span>`; }).join('')}<span>Each cell: gross score, then net (n) and Stableford points (p). Shaded scores counted.</span></div>`;
  return `${head}<div class="sc-scroll"><table class="sc num">${scHead()}<tbody>
  ${scRow('Par', (k) => `<td>${E.PAR[k]}</td>`, E.PAR)}
  ${scRow('Stroke idx', (k) => `<td>${E.SI[k]}</td>`)}
  ${scRow('Count', (k) => `<td>${E.countFor(k) === 0 ? 'All' : c.holes[k].need}</td>`)}
  ${rows}${drv}
  ${scRow(E.fmt === 'betterball' ? 'Pair pts' : 'Team pts', (k) => `<td>${c.hm[k] ?? ''}</td>`, c.hm, 'teamrow')}
  </tbody></table></div>${E.tracksDrives ? driveSummary(E, t) : ''}`;
}

export function scrambleCard(E, t, c) {
  const drv = E.tracksDrives ? scRow('Drive', (k) => { const d = E.teamDrive(t.key, k + 1); const p = t.members.find((m) => m.id === d); return `<td>${p ? esc(initials(p.name)) : ''}</td>`; }) : '';
  const comb = t.members.reduce((s, p) => s + E.handicaps(p).ch, 0);
  const net = Array.from({ length: 18 }, (_, k) => { const g = E.teamScore(t.key, k + 1); return g > 0 ? g - strokesOn(E.SI[k], c.th) : null; });
  const head = `<div class="cardhead">${t.members.map((p) => `<span><b>${esc(p.name)}</b> · HI ${fmtHi(p.hi)} → course HC ${E.handicaps(p).ch}</span>`).join('')}<span>Team HC ${c.th} = ${E.r.teamPct ?? 10}% of combined course HC ${comb}</span></div>`;
  return `${head}<div class="sc-scroll"><table class="sc num">${scHead()}<tbody>
  ${scRow('Par', (k) => `<td>${E.PAR[k]}</td>`, E.PAR)}
  ${scRow('Shots rec.', (k) => { const s = strokesOn(E.SI[k], c.th); return `<td class="dots">${s > 0 ? '•'.repeat(s) : s < 0 ? '+' : ''}</td>`; })}
  ${scRow('Gross', (k) => `<td>${mark(E, E.teamScore(t.key, k + 1), k)}</td>`, grossArr((h) => E.teamScore(t.key, h)))}
  ${scRow('Net', (k) => `<td>${netCell(E.teamScore(t.key, k + 1), strokesOn(E.SI[k], c.th))}</td>`, net)}
  ${scRow('Points', (k) => `<td>${c.hp[k] ?? ''}</td>`, c.hp, 'teamrow')}
  ${drv}</tbody></table></div>${E.tracksDrives ? driveSummary(E, t) : ''}`;
}

function driveSummary(E, t) {
  const dc = E.driveCounts(t), min = E.r.minDrives || 0;
  return `<p class="note cardnote">Drives used: ${t.members.map((p) => `<span class="${dc[p.id] < min ? 'under' : ''}">${esc(first(p.name))} ${dc[p.id]}</span>`).join(' · ')}${min ? ` (minimum ${min} each)` : ''}</p>`;
}

export function teamCard(E, t) { return E.fmt === 'scramble' ? scrambleCard(E, t, E.scrambleCalc(t)) : allianceCard(E, t, E.allianceCalc(t)); }

// Scorecard units follow the format: player (individual), pair (betterball) or team.
export function cardUnits(E) {
  if (!E.isTeam) return E.active.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ id: 'p:' + p.id, title: p.name, p }));
  return E.teamsOf().map((t) => ({
    id: 't:' + t.key, t,
    title: E.fmt === 'betterball' ? `Group ${t.group} · Pair ${t.pair}` : `Group ${t.group} team`,
    opt: (E.fmt === 'betterball' ? `Group ${t.group} · Pair ${t.pair}` : `Group ${t.group}`) + ' — ' + t.members.map((m) => m.name).join(', '),
  }));
}
export function unitCardHTML(E, u, row) {
  const hd = E.lbModel().heads;
  const st = row ? `${row.pos === '–' ? 'No score yet' : 'Pos ' + row.pos} · ${row.main.t}${hd[2] === 'Pts' ? ' pts' : ' ' + hd[2].toLowerCase()} · ${row.thru === 'F' ? 'finished' : 'thru ' + row.thru}` : 'Not in this field';
  const body = u.p ? indCard(E, u.p, E.indCalc(u.p)) : teamCard(E, u.t);
  return `<div class="cardtitle"><b>${esc(u.title)}</b><span>${esc(st)}</span></div>${body}`;
}
