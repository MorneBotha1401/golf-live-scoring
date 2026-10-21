import { useMemo, useState } from 'react';
import { CATS, FORMATS, esc } from '../lib/engine.js';
import { indCard, teamCard } from '../lib/render.js';
import { exportPdf, exportPng, resultsText } from '../lib/exporter.js';
import { useToast } from './ui.jsx';

export function useFilters(E) {
  const [cat, setCat] = useState('all'); const [div, setDiv] = useState('all');
  const cats = E.catsPresent(), divs = E.divsPresent();
  const flt = { cat: cats.includes(cat) ? cat : 'all', div: divs.includes(div) ? div : 'all' };
  return { flt, cats, divs, setCat, setDiv };
}

export function Filters({ E, f }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {f.cats.length > 1 && (
        <div className="chips small" role="group" aria-label="Category">
          {['all', ...f.cats].map((c) => <button key={c} type="button" className="chip" aria-pressed={f.flt.cat === c} onClick={() => f.setCat(c)}>{CATS[c]}</button>)}
        </div>
      )}
      {f.divs.length > 0 && (
        <div className="chips small" role="group" aria-label="Division">
          {['all', ...f.divs].map((d) => <button key={d} type="button" className="chip" aria-pressed={f.flt.div === d} onClick={() => f.setDiv(d)}>{d === 'all' ? 'All divisions' : E.divLabel(d)}</button>)}
        </div>
      )}
    </div>
  );
}

export default function Leaderboard({ E, event, club, tvHref, highlight, showExport = true }) {
  const toast = useToast();
  const f = useFilters(E);
  const m = useMemo(() => E.lbModel(f.flt), [E, f.flt.cat, f.flt.div]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState('');
  const [copyText, setCopyText] = useState(null);
  const hd = m.heads;

  const run = async (what) => {
    setBusy(what);
    try {
      if (what === 'pdf') await exportPdf({ E, event, club, m });
      if (what === 'png') await exportPng({ E, event, club, m });
    } catch { toast("Couldn't create the file. Try again."); }
    setBusy('');
  };
  const copy = async () => {
    const t = resultsText(E, event, m);
    try { await navigator.clipboard.writeText(t); toast('Results copied. Paste them into WhatsApp or an email.'); setCopyText(null); }
    catch { setCopyText(t); }
  };
  const share = async () => {
    const t = resultsText(E, event, m);
    try { await navigator.share({ title: event.name, text: t, url: window.location.origin + '/e/' + event.slug }); } catch { /* cancelled */ }
  };

  if (!E.active.length) return <div className="card"><div className="empty"><b>No players yet</b>The field will appear here once the organiser adds players.</div></div>;

  return (
    <div className="stack">
      <div className="meta"><span className="pill">{FORMATS[E.fmt].label}</span>{E.describe()}</div>
      <Filters E={E} f={f} />
      {showExport && (
        <div className="btns noprint" data-tour="lbexport">
          {tvHref && <a className="btn" href={tvHref} target="_blank" rel="noreferrer">Clubhouse TV display</a>}
          <button type="button" className="btn ghost small" disabled={!!busy} onClick={() => run('pdf')}>{busy === 'pdf' ? 'Preparing…' : 'Download PDF to print'}</button>
          <button type="button" className="btn ghost small" disabled={!!busy} onClick={() => run('png')}>{busy === 'png' ? 'Preparing…' : 'Download image'}</button>
          <button type="button" className="btn ghost small" onClick={copy}>Copy results</button>
          {typeof navigator !== 'undefined' && navigator.share && <button type="button" className="btn ghost small" onClick={share}>Share</button>}
        </div>
      )}
      {copyText && <div className="card form"><p className="note">Select the text below and copy it.</p><textarea readOnly value={copyText} rows={8} onFocus={(e) => e.target.select()} /></div>}
      <div className="card" data-tour="lbtable">
        {!m.rows.length ? <div className="empty"><b>No players in this selection</b>Pick another filter above.</div> : (
          <table className="lb">
            <thead><tr><th>Pos</th><th>{m.team ? 'Team' : 'Player'}</th><th className="c">{hd[0]}</th>{hd[1] && <th className="c">{hd[1]}</th>}<th style={{ textAlign: 'right' }}>{hd[2]}</th></tr></thead>
            <tbody>
              {m.rows.map((row) => {
                const isOpen = open === row.id;
                const mine = highlight && (row.x.p?.id === highlight || row.x.t?.members.some((p) => p.id === highlight));
                return [
                  <tr key={row.id} className="row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : row.id)} style={mine ? { background: 'var(--hl)' } : undefined}>
                    <td className="pos num">{row.pos}</td>
                    <td>
                      <span className="pname">{row.label}</span>
                      {row.div && f.flt.div === 'all' && <span className="divtag">{row.div}</span>}
                      {row.disputes > 0 && <span className="flag bad" title="Player and marker disagree on a hole">Check</span>}
                      {row.signed && <span className="flag ok" title="Card signed and attested">Signed</span>}
                      <span className="sub">{row.sub}</span>
                    </td>
                    <td className="c num">{row.thru}</td>
                    {hd[1] && <td className="c num"><span className={row.second.u ? 'under' : ''}>{row.second.t}</span></td>}
                    <td className="big num"><span className={row.main.u ? 'under' : ''}>{row.main.t}</span></td>
                  </tr>,
                  isOpen && (
                    <tr key={row.id + '-d'} className="detail"><td colSpan={hd[1] ? 5 : 4}>
                      <div dangerouslySetInnerHTML={{ __html: row.x.p ? indCard(E, row.x.p, row.x.c) : teamCard(E, row.x.t) }} />
                    </td></tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="legend">
        <span><i className="mk eagle">3</i>Eagle</span><span><i className="mk birdie">3</i>Birdie</span><span><i className="mk bogey">5</i>Bogey</span><span><i className="mk dbl">6</i>Double+</span>
        {E.allianceLike && <span><i className="sw" />Score that counted</span>}
        <span>{E.cbText}</span>
      </div>
    </div>
  );
}

export function escText(s) { return esc(s); }
