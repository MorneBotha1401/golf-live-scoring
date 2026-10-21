import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDemo } from '../lib/useDemo.js';
import { strokesOn, TERMS } from '../lib/engine.js';
import { BRAND } from '../lib/brand.js';
import { Header, useHashTab } from '../components/ui.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import Scorecards from '../components/Scorecards.jsx';
import { TvScreen } from './TvPage.jsx';

const YOU = 'd20'; // a sample player in the last four-ball, so there are holes left to play

function DemoPhone({ demo }) {
  const { E, setExtra } = demo;
  const me = E.players.find((p) => p.id === YOU);
  const played = E.indCalc(me).thru;
  const [hole, setHole] = useState(Math.min(18, played + 1));
  const i = hole - 1; const par = E.PAR[i]; const ph = E.handicaps(me).ph; const s = strokesOn(E.SI[i], ph);
  const v = E.scoreOf(me, hole);
  const set = (x) => setExtra((ex) => [...ex.filter((e) => !(e.player_id === YOU && e.hole === hole)), { player_id: YOU, hole, role: 'self', strokes: x }, { player_id: YOU, hole, role: 'marker', strokes: x }]);
  const step = (d) => set(v == null ? (d > 0 ? par : par - 1) : Math.min(15, Math.max(1, v + d)));
  const row = E.lbModel().rows.find((r) => r.x.p?.id === YOU);
  return (
    <div className="demo-phone-wrap">
      <div className="demo-phone" aria-label="Sample player scorecard">
        <div className="dp-top"><b>Sunshine Charity Golf Day</b><span>{me.name} · Group {me.group}</span></div>
        <div className="dp-hole">
          <button type="button" aria-label="Previous hole" onClick={() => setHole(((hole + 16) % 18) + 1)}>‹</button>
          <div><div className="dp-hn">Hole {hole}</div><div className="dp-hd">Par {par} · SI {E.SI[i]}{s > 0 && <span className="dots"> {'•'.repeat(s)}</span>}</div></div>
          <button type="button" aria-label="Next hole" onClick={() => setHole((hole % 18) + 1)}>›</button>
        </div>
        <div className="dp-me">
          <div><b>{me.name}</b><small>Playing HC {ph}</small></div>
          <div className="stepper">
            <button type="button" aria-label="One less" onClick={() => step(-1)}>−</button>
            <div className="val"><b className="num">{v ?? '–'}</b><small>{v == null ? 'Tap +' : TERMS[String(v - par)] || (v - par > 0 ? '+' + (v - par) : '')}</small></div>
            <button type="button" aria-label="One more" onClick={() => step(1)}>+</button>
          </div>
        </div>
        <div className="res" style={{ padding: '0 14px' }}>
          {v != null && <span>Net <b>{v - s}</b></span>}
          {v != null && <span><b>{E.ptsFor(i, s, v)}</b> pts</span>}
          <span>Total <b>{E.indCalc(me).pts}</b> pts</span>
        </div>
        <p className="dp-note">{v == null ? 'Tap + to enter a score. The first tap fills in par.' : 'Saved. The leaderboard has already updated.'}</p>
      </div>
      <div className="demo-phone-side">
        <h2>Try it as a player</h2>
        <p>This is what players see on their phones. Enter a score for {me.name.split(' ')[0]} and watch the position change straight away.</p>
        <div className="card pad"><div className="note">On the leaderboard now</div><div className="dp-pos">{row?.pos || '–'}<span>{row ? ` · ${row.main.t} pts · thru ${row.thru}` : ''}</span></div></div>
        <p className="note">In a real event each player opens their own private link, and the others in their four-ball confirm their scores as markers.</p>
      </div>
    </div>
  );
}

export default function Demo() {
  const demo = useDemo({ every: 4000 });
  const [tab, go] = useHashTab(['board', 'phone', 'cards'], 'board');
  return (
    <>
      <Header title="Live demo" sub="A sample charity golf day, scoring live" logo="/icons/icon-192.png"
        right={<span className="hdrlinks"><Link to="/">Home</Link><Link to="/start">Set up your event</Link></span>}
        tabs={[['board', 'Leaderboard'], ['phone', 'Player phone'], ['cards', 'Scorecards']]} current={tab} onTab={go} />
      <main><div className="wrap">
        <div className="banner spread"><span>Sample event: new scores come in every few seconds, just like on the day.</span><Link className="btn small" to="/demo/tv">Open the clubhouse TV view</Link></div>
        {tab === 'board' && <Leaderboard E={demo.E} event={demo.event} club={demo.club} showExport={false} />}
        {tab === 'phone' && <DemoPhone demo={demo} />}
        {tab === 'cards' && <Scorecards E={demo.E} />}
        <div className="card pad spread"><span><b>Like what you see?</b> Set up your own event in minutes. {BRAND.product} is pay-per-event, with nothing to install.</span><Link className="btn" to="/start">Set up your event</Link></div>
      </div></main>
    </>
  );
}

export function DemoTv() {
  const demo = useDemo({ every: 3000 });
  return <TvScreen E={demo.E} event={demo.event} club={demo.club} exitTo="/demo" exitLabel="Back to demo" showHint={false} />;
}
