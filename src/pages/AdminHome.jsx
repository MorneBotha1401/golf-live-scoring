import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { isRealUser, supabase } from '../lib/supabase.js';
import { Header, Loading, fmtDate, statusLabel, useSession } from '../components/ui.jsx';
import { Help } from '../components/Guide.jsx';
import { organiserHelp } from '../lib/helpContent.js';

export default function AdminHome() {
  const session = useSession();
  const [clubs, setClubs] = useState(null); const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!isRealUser(session)) return;
    (async () => {
      const uid = session.user.id;
      const { data: m } = await supabase.from('club_members').select('role, clubs(*)').eq('user_id', uid);
      setClubs((m || []).map((x) => ({ ...x.clubs, role: x.role })));
      const { data: ea } = await supabase.from('event_admins').select('events(id,name,event_date,status,club_id)').eq('user_id', uid);
      setEvents((ea || []).map((x) => x.events).filter(Boolean));
    })();
  }, [session]);

  if (session === undefined) return <Loading />;
  if (!isRealUser(session)) return <Navigate to="/login?next=/admin" replace />;


  return (
    <>
      <Header title="My clubs & events" sub={session.user.email} right={<span className="hdrlinks"><button type="button" onClick={() => supabase.auth.signOut()}>Sign out</button><Help topics={organiserHelp} title="Getting started" intro="Quick answers for organisers." /></span>} />
      <main><div className="wrap">
        {clubs === null ? <Loading /> : (
          <>
            {clubs.length > 0 && (
              <div className="stack"><h3>Clubs you run</h3>
                <div className="evlist">{clubs.map((c) => (
                  <Link key={c.id} className="card evitem" to={`/admin/club/${c.id}`}>
                    {c.logo_url ? <img src={c.logo_url} alt="" style={{ height: 44, width: 44, objectFit: 'contain' }} /> : <span className="pill">Club</span>}
                    <div><div className="nm">{c.name}</div><div className="note">{c.location || ''} · {c.role === 'owner' ? 'Owner' : 'Club admin'}</div></div><span aria-hidden>›</span>
                  </Link>))}</div>
              </div>
            )}
            {events.length > 0 && (
              <div className="stack"><h3>Events you help with</h3>
                <div className="evlist">{events.map((ev) => (
                  <Link key={ev.id} className="card evitem" to={`/admin/event/${ev.id}`}>
                    <span className={'pill st-' + ev.status}>{statusLabel[ev.status]}</span>
                    <div><div className="nm">{ev.name}</div><div className="note">{fmtDate(ev.event_date)}</div></div><span aria-hidden>›</span>
                  </Link>))}</div>
              </div>
            )}
            {!clubs.length && !events.length && (
              <div className="card pad stack">
                <h2>How it works</h2>
                <ol className="howto">
                  <li><b>Create your organisation</b><span>Your company, charity or club.</span></li>
                  <li><b>Create an event</b><span>Name, date, course, format and rules.</span></li>
                  <li><b>Add players</b><span>Type them in or import a spreadsheet.</span></li>
                  <li><b>Send links</b><span>Each player gets a private scorecard link or QR code.</span></li>
                  <li><b>Pay and open scoring</b><span>Scores stream to the leaderboard and clubhouse TV.</span></li>
                </ol>
                <p className="note">Helping with someone else's event? Open the invite link they sent you instead. It brings you straight to that event.</p>
              </div>
            )}
<div className="card form">
              <h2>{clubs.length ? 'Set up another event' : 'Set up your first event'}</h2>
              <p className="note">Create your organisation and your event in a couple of minutes. Setting up is free; pay per event day when you're ready to open scoring.</p>
              <div><Link className="btn" to="/start">Set up an event</Link></div>
            </div>
          </>
        )}
      </div></main>
    </>
  );
}
