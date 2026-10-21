import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { errText, isRealUser, supabase } from '../lib/supabase.js';
import { Header, Loading, fmtDate, statusLabel, useSession } from '../components/ui.jsx';
import { Help } from '../components/Guide.jsx';
import { organiserHelp } from '../lib/helpContent.js';

export default function AdminHome() {
  const session = useSession(); const nav = useNavigate();
  const [clubs, setClubs] = useState(null); const [events, setEvents] = useState([]);
  const [name, setName] = useState(''); const [loc, setLoc] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

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

  const create = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const { data, error } = await supabase.rpc('create_club', { p_name: name, p_location: loc || null });
    setBusy(false); if (error) setErr(errText(error)); else nav(`/admin/club/${data}`);
  };

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
                  <li><b>Create your club</b><span>Below. You become the club owner.</span></li>
                  <li><b>Add your course</b><span>The Seasons card loads in one tap.</span></li>
                  <li><b>Create an event</b><span>Name, date, format and rules.</span></li>
                  <li><b>Add players</b><span>Type them in or import a spreadsheet.</span></li>
                  <li><b>Send links</b><span>Each player gets a private scorecard link or QR code.</span></li>
                  <li><b>Open scoring</b><span>Scores stream to the leaderboard and clubhouse TV.</span></li>
                </ol>
                <p className="note">Helping with someone else's event? Open the invite link they sent you instead. It brings you straight to that event.</p>
              </div>
            )}
            <form className="card form" onSubmit={create}>
              <h2>{clubs.length ? 'Add another club' : 'Create your club'}</h2>
              <div className="grid2">
                <label className="f">Club name<input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Seasons Golf Club" /></label>
                <label className="f">Town or area<input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Brits, North West" /></label>
              </div>
              {err && <div className="banner bad">{err}</div>}
              <div><button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create club'}</button></div>
            </form>
          </>
        )}
      </div></main>
    </>
  );
}
