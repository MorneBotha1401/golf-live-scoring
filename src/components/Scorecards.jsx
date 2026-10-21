import { useMemo, useState } from 'react';
import { FORMATS } from '../lib/engine.js';
import { cardUnits, unitCardHTML } from '../lib/render.js';

export default function Scorecards({ E, initial }) {
  const units = useMemo(() => cardUnits(E), [E]);
  const [sel, setSel] = useState(initial || 'all');
  const pos = useMemo(() => { const o = {}; E.lbModel().rows.forEach((x) => (o[x.id] = x)); return o; }, [E]);
  if (!units.length) return <div className="card"><div className="empty"><b>No scorecards yet</b>Cards appear once players are added{E.isTeam ? ' and put into groups' : ''}.</div></div>;
  const current = sel === 'all' || units.some((u) => u.id === sel) ? sel : 'all';
  const shown = current === 'all' ? units : units.filter((u) => u.id === current);
  const kind = !E.isTeam ? 'players' : E.fmt === 'betterball' ? 'pairs' : 'teams';
  return (
    <div className="stack">
      <div className="meta"><span className="pill">{FORMATS[E.fmt].label}</span>
        {!E.isTeam ? 'One card per player.' : E.fmt === 'betterball' ? "One combined card per pair, with both players and the pair's betterball score." : 'One card per team, with every player and the team total.'}
      </div>
      <select className="pick" value={current} onChange={(e) => setSel(e.target.value)} aria-label="Scorecard to show">
        <option value="all">All {kind} ({units.length})</option>
        {units.map((u) => <option key={u.id} value={u.id}>{u.opt || u.title}</option>)}
      </select>
      {shown.map((u) => <div key={u.id} className="card" dangerouslySetInnerHTML={{ __html: unitCardHTML(E, u, pos[u.id]) }} />)}
    </div>
  );
}
