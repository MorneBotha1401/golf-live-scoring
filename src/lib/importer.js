// Read player lists from Excel/CSV/pasted text.
import { defaultTee } from './presets.js';

export function splitText(t) {
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const d = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  return lines.map((l) => l.split(d).map((c) => c.replace(/^"|"$/g, '')));
}

export async function readFile(file) {
  if (/\.(csv|txt)$/i.test(file.name)) return splitText(await file.text());
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
}

function teeFor(tees, text, lady) {
  const t = String(text || '').toLowerCase();
  const g = lady ? 'F' : 'M';
  if (t) {
    const words = t.split(/[\s·,/-]+/).filter(Boolean);
    const scored = tees.map((x) => {
      const lab = (x.label + ' ' + x.len).toLowerCase();
      let s = words.filter((w) => lab.includes(w)).length * 2;
      if (/rooi/.test(t) && lab.includes('red')) s += 2;
      if (/wit/.test(t) && lab.includes('white')) s += 2;
      if (/geel/.test(t) && lab.includes('yellow')) s += 2;
      if (x.gender === g) s += 1;
      return { x, s };
    }).sort((a, b) => b.s - a.s);
    if (scored[0] && scored[0].s >= 2) return scored[0].x.code;
  }
  return defaultTee(tees, g);
}

/** rows: array of arrays. existingMaxGroup: highest group already used. */
export function parseRows(raw, { tees, autoGroup = true, existingMaxGroup = 0 }) {
  let rows = (raw || []).map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some((c) => c));
  if (!rows.length) return [];
  const hdr = rows[0].map((c) => c.toLowerCase());
  const find = (re) => hdr.findIndex((h) => re.test(h));
  let ci = {
    name: find(/^(name|player|full ?name|naam|speler|golfer)/), first: find(/^(first|voornaam|given)/), last: find(/^(surname|last|van|family)/),
    hi: find(/(handicap|index|hcp|^hi$|^hc$|indeks)/), tee: find(/tee/), group: find(/(group|groep|four|team|flight|span)/),
    pair: find(/(pair|paar)/), gender: find(/(gender|sex|geslag|^m\/f$)/), cat: find(/(categ|^cat$|kategorie|age group|ouderdom)/),
    phone: find(/(phone|mobile|cell|selfoon|whatsapp)/), email: find(/(e-?mail|epos)/),
  };
  const hasHdr = ci.hi >= 0 && (ci.name >= 0 || ci.first >= 0 || ci.last >= 0);
  if (hasHdr) rows = rows.slice(1);
  else ci = { name: 0, first: -1, last: -1, hi: 1, tee: 2, group: 3, pair: 4, gender: -1, cat: -1, phone: -1, email: -1 };
  const g = (r, i) => (i >= 0 ? r[i] || '' : '');
  const out = rows.map((row) => {
    const fn = g(row, ci.name >= 0 ? ci.name : ci.first), ln = g(row, ci.last);
    const name = (ln && !fn.toLowerCase().includes(ln.toLowerCase()) ? [fn, ln].filter(Boolean).join(' ') : fn).replace(/\s+/g, ' ').slice(0, 60);
    const hs = g(row, ci.hi).replace(',', '.').replace(/\s/g, '');
    const hi = hs.startsWith('+') ? -parseFloat(hs.slice(1)) : parseFloat(hs);
    const gen = g(row, ci.gender).toLowerCase(), ts = g(row, ci.tee).toLowerCase();
    const lady = /^(f|l|w|v|d)|lad|fem|wom|dame|vrou/.test(gen) || /lad|dame/.test(ts);
    const grp = parseInt(g(row, ci.group)), pr = g(row, ci.pair).toUpperCase(), cs = g(row, ci.cat).toLowerCase();
    const cat = /jun|jnr|jeug|^j$/.test(cs) ? 'junior' : /sen|snr|vet|^s$/.test(cs) ? 'senior' : 'open';
    const err = !name ? 'No name' : !isFinite(hi) ? 'No handicap index' : hi < -10 || hi > 54 ? 'Handicap out of range' : '';
    return {
      name, hi: isFinite(hi) ? Math.round(hi * 10) / 10 : null, gender: lady ? 'F' : 'M', cat, tee: teeFor(tees, ts, lady),
      grp: grp > 0 ? grp : null, pair: pr === 'B' ? 'B' : pr === 'A' ? 'A' : null, phone: g(row, ci.phone), email: g(row, ci.email), err,
    };
  });
  if (ci.group < 0 && autoGroup) {
    let n = 0;
    out.forEach((p) => { if (p.err) return; p.grp = existingMaxGroup + Math.floor(n / 4) + 1; if (!p.pair) p.pair = n % 4 < 2 ? 'A' : 'B'; n++; });
  }
  out.forEach((p) => { if (!p.grp) p.grp = 0; if (!p.pair) p.pair = 'A'; });
  return out;
}

export const TEMPLATE_CSV = 'Name,Handicap Index,Gender,Category,Tee,Group,Pair,Mobile,Email\n'
  + 'Example Player One,12.4,M,Adult,White,1,A,0821234567,one@example.com\n'
  + 'Example Player Two,18.2,F,Adult,Red,1,A,,\n'
  + 'Example Player Three,6.0,M,Junior,White,1,B,,\n'
  + 'Example Player Four,24.5,M,Senior,Red,1,B,,\n';
