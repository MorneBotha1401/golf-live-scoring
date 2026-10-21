import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEventData } from '../lib/useEvent.js';
import { makeEngine, FORMATS } from '../lib/engine.js';
import { Sponsors } from '../components/ui.jsx';

const clockStr = () => new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

export default function TvPage() {
  const { slug } = useParams();
  const d = useEventData({ slug });
  const E = useMemo(() => (d.event ? makeEngine(d) : null), [d.event, d.course, d.players, d.scores, d.teamScores]); // eslint-disable-line react-hooks/exhaustive-deps
  if (d.loading) return <div className="tv"><div className="tvempty">Connecting to live scores…</div></div>;
  if (!E) return <div className="tv"><div className="tvempty">This event isn't available yet.</div></div>;
  return <TvScreen E={E} event={d.event} club={d.club} exitTo={`/e/${slug}`} />;
}

/** The clubhouse scoreboard itself; also used by the live demo with sample data. */
export function TvScreen({ E, event, club, exitTo, exitLabel = 'Exit TV', showHint = true }) {
  const d = { event, club };
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState(clockStr());
  const [vh, setVh] = useState(window.innerHeight);
  // First time on this screen: a short hint, then it gets out of the way.
  const [hint, setHint] = useState(() => { if (!showHint) return false; try { return !localStorage.getItem('tvhint'); } catch { return true; } });
  const hideHint = () => { setHint(false); try { localStorage.setItem('tvhint', '1'); } catch { /* ignore */ } };
  useEffect(() => { if (!hint) return undefined; const t = setTimeout(hideHint, 15000); return () => clearTimeout(t); }, [hint]);

  useEffect(() => { const a = setInterval(() => setTick((t) => t + 1), 12000); const b = setInterval(() => setClock(clockStr()), 1000); const r = () => setVh(window.innerHeight); window.addEventListener('resize', r);
    let lock; const wake = () => { try { navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {}); } catch { /* not supported */ } };
    wake(); const vis = () => document.visibilityState === 'visible' && wake(); document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(a); clearInterval(b); window.removeEventListener('resize', r); document.removeEventListener('visibilitychange', vis); try { lock?.release(); } catch { /* ignore */ } };
  }, []);

  const screens = [{ cat: 'all', div: 'all' }, ...E.divsPresent().map((dv) => ({ cat: 'all', div: dv }))];
  const cats = E.catsPresent(); if (cats.length > 1) cats.forEach((c) => screens.push({ cat: c, div: 'all' }));
  const per = Math.max(4, Math.floor((vh * 0.64) / (vh * 0.076)));
  // walk screens and their pages in turn
  const plan = []; screens.forEach((s, i) => { const m = E.lbModel(s); const pages = Math.max(1, Math.ceil(m.rows.length / per)); for (let p = 0; p < pages; p++) plan.push({ i, s, m, p, pages }); });
  const cur = plan[tick % plan.length];
  const { m, p, pages, s } = cur; const hd = m.heads;
  const rows = m.rows.slice(p * per, (p + 1) * per);
  const title = m.flabel || (E.isTeam ? 'Team leaderboard' : E.divsOn ? 'Overall field' : 'Leaderboard');
  const logo = d.event.logo_url || d.club?.logo_url;

  return (
    <div className="tv">
      <div className="tvhead">
        <div className="clubrow">{logo && <img src={logo} alt="" />}<div><div className="club">{d.club?.name}</div><div className="comp">{d.event.name} · {FORMATS[E.fmt].label}</div></div></div>
        <div className="scr">{title}<small>{pages > 1 ? `Page ${p + 1} of ${pages}` : `${m.rows.length} ${m.team ? 'teams' : 'players'}`}</small></div>
        <div className="clk">{clock}<small><i style={d.event.status === 'live' ? undefined : { background: '#aaa' }} />{d.event.status === 'live' ? 'LIVE' : d.event.status === 'finished' ? 'FINAL' : 'NOT STARTED'}</small></div>
      </div>
      <div className="tvbody">
        {rows.length ? (
          <table className="tvlb">
            <thead><tr><th className="pos">Pos</th><th>{m.team ? 'Team' : 'Player'}</th><th className="c">{hd[0]}</th>{hd[1] && <th className="c">{hd[1]}</th>}<th className="mn" style={{ fontSize: 'inherit' }}>{hd[2]}</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const x = row.x; const extra = x.p ? `HC ${row.hc}` : E.fmt === 'scramble' ? `HC ${row.hc}` : `Group ${x.t.group}`;
                return (
                  <tr key={row.id} className={row.pos === '1' || row.pos === 'T1' ? 'lead' : ''}>
                    <td className="pos">{row.pos}</td>
                    <td className="nm">{row.div && s.div === 'all' && <span className="dv">{row.div}</span>}{row.label}<small>{extra}</small></td>
                    <td className="c">{row.thru}</td>
                    {hd[1] && <td className="c"><span className={row.second.u ? 'under' : ''}>{row.second.t}</span></td>}
                    <td className="mn"><span className={row.main.u ? 'under' : ''}>{row.main.t}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="tvempty">No scores in yet{m.flabel ? ' for ' + m.flabel : ''}</div>}
      </div>
      <div className="tvfoot">
        <Sponsors event={d.event} />
        <div className="tvdots">{screens.length > 1 && screens.map((_, i) => <i key={i} className={i === cur.i ? 'on' : ''} />)}</div>
        <span>{E.cbText}</span>
      </div>
      {hint && (
        <div className="tvhint" role="note">
          <span>This screen updates by itself and moves to the next page or division every 12 seconds. Click <b>Full screen</b> (bottom right) for the best view.</span>
          <button type="button" onClick={hideHint}>Got it</button>
        </div>
      )}
      <div className="tvctl">
        <button type="button" onClick={() => { try { document.documentElement.requestFullscreen?.(); } catch { /* not supported */ } }}>Full screen</button>
        <Link to={exitTo}>{exitLabel}</Link>
      </div>
    </div>
  );
}
