import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEventData } from '../lib/useEvent.js';
import { makeEngine } from '../lib/engine.js';
import { Header, LiveBadge, Loading, Sponsors, fmtDate, useHashTab } from '../components/ui.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import Scorecards from '../components/Scorecards.jsx';
import { Tip } from '../components/Guide.jsx';

export default function PublicEvent() {
  const { slug } = useParams();
  const d = useEventData({ slug });
  const E = useMemo(() => (d.event ? makeEngine(d) : null), [d.event, d.course, d.players, d.scores, d.teamScores]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, go] = useHashTab(['board', 'cards'], 'board');
  if (d.loading) return <Loading />;
  if (!d.event) return <main><div className="wrap"><div className="card"><div className="empty"><b>Event not found</b>Check the link, or the event may not be published yet.</div></div></div></main>;
  const ev = d.event;
  return (
    <>
      <Header title={ev.name} sub={`${d.club?.name || ''} · ${fmtDate(ev.event_date)}`} logo={ev.logo_url || d.club?.logo_url} status={<LiveBadge event={ev} />}
        tabs={[['board', 'Leaderboard'], ['cards', 'Scorecards']]} current={tab} onTab={go} />
      <main><div className="wrap">
        {ev.self_register && ['draft', 'live'].includes(ev.status) && (
          <div className="banner spread"><span>Playing in this event and not on the list?</span><Link className="btn small" to={`/e/${slug}/join`}>Register to play</Link></div>
        )}
        {tab === 'board' && <Tip id="public-board">Scores update live as players enter them. Tap any name to see that card hole by hole.</Tip>}
        {tab === 'board' && <Leaderboard E={E} event={ev} club={d.club} tvHref={`/e/${slug}/tv`} />}
        {tab === 'cards' && <Scorecards E={E} />}
        <Sponsors event={ev} />
        <p className="note">Live scores update automatically{d.updatedAt ? ` · last update ${d.updatedAt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}` : ''}.</p>
      </div></main>
    </>
  );
}
