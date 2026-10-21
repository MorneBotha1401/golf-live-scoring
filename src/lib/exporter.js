// Leaderboard image/PDF, player QR sheets and link lists.
import QRCode from 'qrcode';

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
export const slug = (s) => String(s || 'leaderboard').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'leaderboard';

async function loadImage(src) {
  if (!src) return null;
  return new Promise((ok) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
}

export async function drawBoard({ E, event, club, m, rows, page = 1, pages = 1 }) {
  try { await Promise.all([document.fonts.load('700 40px "Barlow Condensed"'), document.fonts.load('600 20px "Source Sans 3"')]); } catch { /* fonts optional */ }
  const W = 1240, top = 230, rowH = 58, foot = 70, H = top + 52 + rows.length * rowH + foot, sc = 2;
  const cv = document.createElement('canvas'); cv.width = W * sc; cv.height = H * sc; const g = cv.getContext('2d'); g.scale(sc, sc);
  const D = (w, s) => `${w} ${s}px "Barlow Condensed","Arial Narrow",sans-serif`, B = (w, s) => `${w} ${s}px "Source Sans 3",system-ui,sans-serif`;
  const fit = (t, w) => { if (g.measureText(t).width <= w) return t; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1); return t + '…'; };
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1c4a32'; g.fillRect(0, 0, W, 150); g.fillStyle = '#a86a0e'; g.fillRect(0, 150, W, 6);
  const logo = await loadImage(event.logo_url || club?.logo_url);
  let x0 = 48;
  if (logo) { const h = 96, w = Math.min(220, logo.width * h / logo.height); g.fillStyle = '#ffffff'; g.fillRect(44, 27, w + 8, h + 8); g.drawImage(logo, 48, 31, w, h); x0 = 48 + w + 28; }
  g.fillStyle = '#f2f5ef'; g.font = D(700, 46); g.fillText(fit((club?.name || 'Leaderboard').toUpperCase(), W - x0 - 220), x0, 70);
  g.font = B(600, 18); g.globalAlpha = 0.8; g.fillText('LIVE LEADERBOARD', x0 + 2, 102); g.globalAlpha = 1;
  g.font = D(600, 26); g.textAlign = 'right'; g.fillText(event.event_date || '', W - 48, 70); g.textAlign = 'left';
  g.fillStyle = '#16241b'; g.font = D(700, 38); g.fillText(fit((event.name || '') + (m.flabel ? ' · ' + m.flabel : ''), W - 96), 48, 202);
  g.fillStyle = '#5b6a60'; g.font = B(400, 18); g.fillText(fit(E.describe(), W - 96), 48, top);
  const X = { pos: 48, name: 130, thru: 880, sec: 1010, main: W - 48 }; const y0 = top + 40; const hd = m.heads;
  g.font = D(600, 18); g.fillStyle = '#5b6a60';
  g.fillText('POS', X.pos, y0); g.fillText(m.team ? 'TEAM' : 'PLAYER', X.name, y0); g.textAlign = 'center'; g.fillText(hd[0].toUpperCase(), X.thru, y0);
  if (hd[1]) g.fillText(hd[1].toUpperCase(), X.sec, y0); g.textAlign = 'right'; g.fillText(hd[2].toUpperCase(), X.main, y0); g.textAlign = 'left';
  g.fillStyle = '#d4dcd2'; g.fillRect(48, y0 + 12, W - 96, 1);
  rows.forEach((row, i) => {
    const y = y0 + 12 + i * rowH; if (i % 2 === 0) { g.fillStyle = '#f3f5f1'; g.fillRect(48, y, W - 96, rowH); }
    const mid = y + rowH / 2; g.fillStyle = '#16241b'; g.font = D(700, 26); g.fillText(row.pos, X.pos + 6, mid + 9);
    g.font = B(700, 21); g.fillText(fit(row.label, X.thru - X.name - 70), X.name, mid - 2); g.fillStyle = '#5b6a60'; g.font = B(400, 15); g.fillText(fit(row.sub, X.thru - X.name - 70), X.name, mid + 19);
    g.textAlign = 'center'; g.fillStyle = '#16241b'; g.font = D(600, 24); g.fillText(row.thru, X.thru, mid + 8);
    if (hd[1]) { g.fillStyle = row.second.u ? '#c4252c' : '#16241b'; g.fillText(row.second.t, X.sec, mid + 8); }
    g.textAlign = 'right'; g.font = D(700, 32); g.fillStyle = row.main.u ? '#c4252c' : '#16241b'; g.fillText(row.main.t, X.main - 6, mid + 11); g.textAlign = 'left';
  });
  g.fillStyle = '#5b6a60'; g.font = B(400, 15); const fy = H - 30;
  g.fillText(`Updated ${new Date().toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })} · ${E.cbText}`, 48, fy);
  if (pages > 1) { g.textAlign = 'right'; g.fillText(`Page ${page} of ${pages}`, W - 48, fy); g.textAlign = 'left'; }
  return cv;
}

export async function exportPng(args) {
  const cv = await drawBoard({ ...args, rows: args.m.rows });
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
  saveBlob(blob, slug(args.event.name + (args.m.flabel ? ' ' + args.m.flabel : '')) + '-leaderboard.png');
  return blob;
}

export async function exportPdf(args) {
  const { jsPDF } = await import('jspdf');
  const per = 26, pages = Math.max(1, Math.ceil(args.m.rows.length / per));
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  for (let p = 0; p < pages; p++) {
    const cv = await drawBoard({ ...args, rows: args.m.rows.slice(p * per, (p + 1) * per), page: p + 1, pages });
    if (p) pdf.addPage(); const w = 190, h = cv.height * w / cv.width; pdf.addImage(cv.toDataURL('image/png'), 'PNG', 10, 10, w, h);
  }
  saveBlob(pdf.output('blob'), slug(args.event.name + (args.m.flabel ? ' ' + args.m.flabel : '')) + '-leaderboard.pdf');
}

export function resultsText(E, event, m) {
  const hd = m.heads;
  const lines = [`${event.name}${m.flabel ? ' · ' + m.flabel : ''} · ${event.event_date || ''}`, E.describe(), ''];
  m.rows.forEach((row) => {
    const extra = hd[1] && row.second.t && row.second.t !== '–' ? ` (${hd[1].toLowerCase()} ${row.second.t})` : '';
    lines.push(`${row.pos}. ${row.label} · ${row.main.t}${hd[2] === 'Pts' ? ' pts' : ''}${extra} · ${row.thru === 'F' ? 'finished' : 'thru ' + row.thru}`);
  });
  return lines.join('\n');
}

export const qrDataUrl = (text, size = 512) => QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' });

// A4 sheet of personal QR codes: 3 x 4 per page, name + group under each.
export async function playerQrSheet({ event, items }) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const cols = 3, rowsPer = 4, cw = 190 / cols, ch = 277 / rowsPer;
  for (let i = 0; i < items.length; i++) {
    const k = i % (cols * rowsPer); if (i && k === 0) pdf.addPage();
    const cx = 10 + (k % cols) * cw, cy = 10 + Math.floor(k / cols) * ch;
    pdf.setDrawColor(200); pdf.setLineDashPattern([1, 1], 0); pdf.rect(cx + 1, cy + 1, cw - 2, ch - 2);
    pdf.setFontSize(9); pdf.setTextColor(90); pdf.text(event.name.slice(0, 40), cx + cw / 2, cy + 7, { align: 'center' });
    const img = await qrDataUrl(items[i].url, 400); const s = 42; pdf.addImage(img, 'PNG', cx + (cw - s) / 2, cy + 10, s, s);
    pdf.setFontSize(12); pdf.setTextColor(20); pdf.text(items[i].name.slice(0, 32), cx + cw / 2, cy + 58, { align: 'center' });
    pdf.setFontSize(9); pdf.setTextColor(90); pdf.text(items[i].sub || '', cx + cw / 2, cy + 63, { align: 'center' });
    pdf.text('Scan to open your scorecard', cx + cw / 2, cy + 67.5, { align: 'center' });
  }
  saveBlob(pdf.output('blob'), slug(event.name) + '-player-qr-codes.pdf');
}

export async function posterPdf({ event, club, url, title, line }) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setFillColor(28, 74, 50); pdf.rect(0, 0, 210, 40, 'F');
  pdf.setTextColor(255); pdf.setFontSize(24); pdf.text((club?.name || '').toUpperCase(), 105, 18, { align: 'center' });
  pdf.setFontSize(14); pdf.text(event.name, 105, 30, { align: 'center' });
  pdf.setTextColor(20); pdf.setFontSize(30); pdf.text(title, 105, 70, { align: 'center' });
  const img = await qrDataUrl(url, 900); pdf.addImage(img, 'PNG', 45, 85, 120, 120);
  pdf.setFontSize(14); pdf.setTextColor(60); pdf.text(line, 105, 220, { align: 'center' });
  pdf.setFontSize(10); pdf.text(url, 105, 232, { align: 'center' });
  saveBlob(pdf.output('blob'), slug(event.name + ' ' + title) + '.pdf');
}

export function linksCsv(rows) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = ['Name,Group,Mobile,Email,Personal link', ...rows.map((r) => [r.name, r.grp || '', r.phone || '', r.email || '', r.url].map(q).join(','))].join('\n');
  return new Blob([body], { type: 'text/csv' });
}
