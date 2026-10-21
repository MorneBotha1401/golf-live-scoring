import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { errText, isRealUser, supabase } from '../lib/supabase.js';
import { uploadLogo } from '../lib/upload.js';
import { PRESETS } from '../lib/presets.js';
import CourseEditor from '../components/CourseEditor.jsx';
import CoursePicker from '../components/CoursePicker.jsx';
import { FORMATS, DEFAULT_SETTINGS } from '../lib/engine.js';
import { Checklist, Help, Tip, Tour, useTour } from '../components/Guide.jsx';
import { clubAdminHelp } from '../lib/helpContent.js';
import { ConfirmButton, CopyField, Header, Loading, fmtDate, statusLabel, useHashTab, useSession, useToast } from '../components/ui.jsx';

export default function ClubAdmin() {
  const { clubId } = useParams(); const session = useSession(); const toast = useToast(); const nav = useNavigate();
  const [tab, go] = useHashTab(['events', 'archive', 'courses', 'people', 'club'], 'events');
  const [club, setClub] = useState(null); const [events, setEvents] = useState([]); const [courses, setCourses] = useState([]);
  const [members, setMembers] = useState([]); const [invites, setInvites] = useState([]); const [eventAdmins, setEventAdmins] = useState([]);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    const [{ data: c }, { data: ev }, { data: co }, { data: mem }, { data: inv }] = await Promise.all([
      supabase.from('clubs').select('*').eq('id', clubId).maybeSingle(),
      supabase.from('events').select('*').eq('club_id', clubId).order('event_date', { ascending: false }),
      supabase.from('courses').select('*').eq('club_id', clubId).order('created_at'),
      supabase.from('club_members').select('*').eq('club_id', clubId),
      supabase.from('invites').select('*').eq('club_id', clubId).order('created_at', { ascending: false }),
    ]);
    setClub(c); setEvents(ev || []); setCourses(co || []); setMembers(mem || []); setInvites(inv || []);
    if (!mem?.length) setDenied(true);
    const ids = (ev || []).map((e) => e.id);
    if (ids.length) { const { data: ea } = await supabase.from('event_admins').select('*').in('event_id', ids); setEventAdmins(ea || []); }
  }, [clubId]);
  useEffect(() => { if (isRealUser(session)) load(); }, [session, load]);

  const tour = useTour('clubadmin', !!club && !denied);

  if (session === undefined) return <Loading />;
  if (!isRealUser(session)) return <Navigate to={`/login?next=/admin/club/${clubId}`} replace />;
  if (denied && club) return <main><div className="wrap"><div className="card"><div className="empty"><b>You're not an admin of this club</b><Link to="/admin">Back to my clubs</Link></div></div></div></main>;
  if (!club) return <Loading />;

  const live = events.filter((e) => e.status !== 'archived');
  const archived = events.filter((e) => e.status === 'archived');
  const items = [
    { key: 'course', label: 'Add your course', hint: 'The Seasons card loads in one tap. Check pars, stroke indexes, ratings and slopes against the current card.', done: courses.length > 0, action: { label: 'Add course', onClick: () => go('courses') } },
    { key: 'event', label: 'Create your first event', hint: 'Give it the tournament or golf day name, e.g. BMW Championship.', done: events.length > 0, action: { label: 'New event', onClick: () => go('events') } },
    { key: 'logo', label: 'Upload the club logo', hint: 'Shown when an event has no logo of its own.', done: !!club.logo_url, optional: true, action: { label: 'Club details', onClick: () => go('club') } },
    { key: 'people', label: 'Invite helpers', hint: 'An event admin can run one event: players, logos, links and scores.', done: members.length > 1 || eventAdmins.length > 0 || invites.length > 0, optional: true, action: { label: 'Invite', onClick: () => go('people') } },
  ];
  const steps = [
    { target: null, title: `Welcome to ${club.name}`, body: <><p>This is your club's home: every event, past and present, plus your courses and the people who help you run things.</p><p>A quick look around.</p></> },
    { target: '[data-tour="checklist"]', title: 'Getting started', body: <p>Follow this checklist the first time. Add your course, then create an event. It ticks itself off.</p>, before: () => go('events') },
    { target: '[data-tour="tabs"]', title: 'The tabs', body: <><p><b>Events</b>: create events and open upcoming, live and finished ones · <b>Archive</b>: past events with full results, by year.</p><p><b>Courses</b>: tees, ratings, slopes and the hole-by-hole card · <b>Admins &amp; invites</b>: bring in helpers · <b>Club details</b>: name and logo.</p></> },
    { target: '[data-tour="newevent"]', title: 'Create an event', body: <p>Give it a name, date, course and format. On the next screen you add players, logos, sponsors and rules, and send the players their links.</p>, before: () => go('events') },
    { target: '.helpbtn', title: 'Help is always here', body: <p>Tap <b>?</b> any time to see this tour again.</p> },
  ];

  return (
    <>
      <Header title={club.name} sub={'Club admin' + (club.location ? ' · ' + club.location : '')} logo={club.logo_url}
        right={<span className="hdrlinks"><Link to="/admin">All clubs</Link><Help topics={clubAdminHelp} title="Help running your club" intro="Quick answers. Tap a question to open it." onTour={tour.start} /></span>}
        tabs={[['events', 'Events'], ['archive', `Archive (${archived.length})`], ['courses', 'Courses'], ['people', 'Admins & invites'], ['club', 'Club details']]} current={tab} onTab={go} />
      <Tour steps={steps} open={tour.open} onClose={tour.close} />
      <main><div className="wrap">
        {tab !== 'archive' && <div data-tour="checklist"><Checklist id={'club:' + club.id} title="Set up your club" items={items} /></div>}
        {tab === 'events' && <EventsTab {...{ club, courses, events: live, nav, toast, go }} />}
        {tab === 'archive' && <ArchiveTab events={archived} reload={load} toast={toast} />}
        {tab === 'courses' && <CoursesTab {...{ club, courses, reload: load, toast }} />}
        {tab === 'people' && <PeopleTab {...{ club, events, members, invites, eventAdmins, reload: load, toast, me: session.user.id }} />}
        {tab === 'club' && <ClubTab {...{ club, reload: load, toast }} />}
      </div></main>
    </>
  );
}

function EventItem({ ev }) {
  const d = new Date(ev.event_date + 'T12:00:00');
  return (
    <Link className="card evitem" to={`/admin/event/${ev.id}`}>
      <div className="date"><b>{d.getDate()}</b><span>{d.toLocaleDateString('en-ZA', { month: 'short' })}</span></div>
      <div style={{ minWidth: 0 }}><div className="nm">{ev.name}</div><div className="note"><span className={'pill st-' + ev.status}>{statusLabel[ev.status]}</span>{FORMATS[ev.format]?.label} · {fmtDate(ev.event_date)}</div></div>
      <span aria-hidden>›</span>
    </Link>
  );
}

function EventsTab({ club, courses, events, nav, toast, go }) {
  const [f, setF] = useState({ name: '', date: new Date().toISOString().slice(0, 10), course: courses[0]?.id || '', format: 'stableford' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!f.course && courses[0]) setF((x) => ({ ...x, course: courses[0].id })); }, [courses]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async (e) => {
    e.preventDefault(); if (!f.course) { toast('Add a course first'); go('courses'); return; }
    setBusy(true);
    const { data, error } = await supabase.from('events').insert({ club_id: club.id, course_id: f.course, name: f.name.trim(), event_date: f.date, format: f.format, settings: DEFAULT_SETTINGS }).select('id').single();
    setBusy(false); if (error) toast(errText(error)); else nav(`/admin/event/${data.id}`);
  };
  const upcoming = events.filter((e) => e.status !== 'finished');
  const finished = events.filter((e) => e.status === 'finished');
  return (
    <>
      <div className="card form" data-tour="newevent">
        <h2>New event</h2>
        <p className="note">Name, date, course and format. Setting up is free; you pay per event day when you're ready to open scoring.</p>
        <div><Link className="btn" to={`/start?org=${club.id}`}>Create an event</Link></div>
      </div>
      <h3>Upcoming &amp; live</h3>
      <div className="evlist">{upcoming.length ? upcoming.map((ev) => <EventItem key={ev.id} ev={ev} />) : <div className="card"><div className="empty">No upcoming events.</div></div>}</div>
      {finished.length > 0 && (<><h3>Finished</h3><div className="evlist">{finished.map((ev) => <EventItem key={ev.id} ev={ev} />)}</div><p className="note">Move finished events to the archive from each event's Setup tab. Archived results stay available.</p></>)}
    </>
  );
}

function ArchiveTab({ events, reload, toast }) {
  const [q, setQ] = useState('');
  const years = [...new Set(events.map((e) => e.event_date.slice(0, 4)))].sort().reverse();
  const shown = events.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  const restore = async (ev) => { const { error } = await supabase.from('events').update({ status: 'finished' }).eq('id', ev.id); if (error) toast(errText(error)); else { toast('Moved back to finished events'); reload(); } };
  if (!events.length) return <div className="card"><div className="empty"><b>The archive is empty</b>Finished events you archive are kept here with their full results.</div></div>;
  return (
    <div className="stack">
      <input className="pick" placeholder="Search archived events" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search archive" />
      {years.map((y) => {
        const list = shown.filter((e) => e.event_date.startsWith(y)); if (!list.length) return null;
        return (
          <div key={y} className="stack"><h3>{y}</h3>
            {list.map((ev) => (
              <div key={ev.id} className="card evitem">
                <span className="pill st-archived">Archived</span>
                <div style={{ minWidth: 0 }}><div className="nm">{ev.name}</div><div className="note">{fmtDate(ev.event_date)} · {FORMATS[ev.format]?.label}</div></div>
                <div className="row"><a className="btn ghost small" href={`/e/${ev.slug}`} target="_blank" rel="noreferrer">Results</a><Link className="btn ghost small" to={`/admin/event/${ev.id}`}>Open</Link><button type="button" className="btn ghost small" onClick={() => restore(ev)}>Restore</button></div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function CoursesTab({ club, courses, reload, toast }) {
  const [edit, setEdit] = useState(null);
  const [libOpen, setLibOpen] = useState(false);
  const startNew = (preset) => setEdit({ id: null, club_id: club.id, ...JSON.parse(JSON.stringify(PRESETS[preset])) });
  return (
    <div className="stack">
      {courses.map((c) => (
        <div key={c.id} className="card evitem">
          <span className="pill">Par {c.holes.reduce((a, h) => a + (+h.par || 0), 0)}</span>
          <div><div className="nm">{c.name}</div><div className="note">{c.tees.map((t) => `${t.label} ${t.cr}/${t.slope}`).join(' · ')}</div></div>
          <button type="button" className="btn ghost small" onClick={() => setEdit(JSON.parse(JSON.stringify(c)))}>Edit</button>
        </div>
      ))}
      <Tip id="courses-check">Course handicaps come from each tee's <b>course rating</b> and <b>slope</b>. Copy them exactly from the club's current card or the handicap system, and update them whenever the course is re-rated.</Tip>
      <div className="btns">
        <button type="button" className="btn" onClick={() => setLibOpen(!libOpen)}>{libOpen ? 'Close the library' : 'Add from the course library'}</button>
        <button type="button" className="btn ghost" onClick={() => startNew('blank')}>Type in a new course</button>
      </div>
      {libOpen && <div className="card pad"><CoursePicker clubId={club.id} toast={toast} onPick={() => { setLibOpen(false); reload(); toast('Course added'); }} /></div>}
      {edit && <CourseEditor key={edit.id || 'new'} course={edit} onDone={() => { setEdit(null); reload(); }} toast={toast} />}
    </div>
  );
}

function inviteUrl(token) { return `${window.location.origin}/invite/${token}`; }

function PeopleTab({ club, events, members, invites, eventAdmins, reload, toast, me }) {
  const [f, setF] = useState({ role: 'event_admin', event: events.find((e) => e.status !== 'archived')?.id || '', email: '' });
  const [made, setMade] = useState(null);
  const create = async (e) => {
    e.preventDefault();
    const row = { club_id: club.id, role: f.role, event_id: f.role === 'event_admin' ? f.event : null, email: f.email || null };
    if (f.role === 'event_admin' && !f.event) { toast('Choose the event'); return; }
    const { data, error } = await supabase.from('invites').insert(row).select('*').single();
    if (error) toast(errText(error)); else { setMade(data); reload(); }
  };
  const evName = (id) => events.find((e) => e.id === id)?.name || 'event';
  const msg = (inv) => `You're invited to help run ${inv.role === 'club_admin' ? club.name : evName(inv.event_id)} on the live scoring system. Open this link and sign in with your email: ${inviteUrl(inv.token)}`;
  const pending = invites.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date());
  const remove = async (table, match) => { const { error } = await supabase.from(table).delete().match(match); if (error) toast(errText(error)); else reload(); };
  return (
    <div className="stack">
      <form className="card form" onSubmit={create}>
        <h2>Invite someone</h2>
        <div className="grid2">
          <label className="f">Role<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="event_admin">Event admin: one event only</option><option value="club_admin">Club admin: all events</option></select></label>
          {f.role === 'event_admin' && <label className="f">Event<select value={f.event} onChange={(e) => setF({ ...f, event: e.target.value })}><option value="">Choose…</option>{events.filter((e) => e.status !== 'archived').map((e) => <option key={e.id} value={e.id}>{e.name} · {fmtDate(e.event_date)}</option>)}</select></label>}
          <label className="f">Their email (for your records)<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        </div>
        <p className="note">An event admin can edit that event: players, uploads, company logos and sponsors, links and scores. A club admin can do everything you can, except remove the owner.</p>
        <div><button className="btn">Create invite link</button></div>
        {made && (
          <div className="stack">
            <p><b>Send this link.</b> It works once and expires in 14 days.</p>
            <CopyField value={inviteUrl(made.token)} />
            <div className="btns">
              <a className="btn ghost small" href={`https://wa.me/?text=${encodeURIComponent(msg(made))}`} target="_blank" rel="noreferrer">Send by WhatsApp</a>
              <a className="btn ghost small" href={`mailto:${made.email || ''}?subject=${encodeURIComponent('Invitation: ' + (made.role === 'club_admin' ? club.name : evName(made.event_id)))}&body=${encodeURIComponent(msg(made))}`}>Send by email</a>
            </div>
          </div>
        )}
      </form>
      <div className="card"><div className="pad"><h3>Club admins</h3></div>
        <div className="tscroll"><table className="list"><tbody>
          {members.map((m) => <tr key={m.user_id}><td>{m.email || 'Admin'}{m.user_id === me && ' (you)'}</td><td>{m.role === 'owner' ? 'Owner' : 'Club admin'}</td><td className="r">{m.role !== 'owner' && m.user_id !== me && <ConfirmButton className="link" confirmText="Tap again to remove" onConfirm={() => remove('club_members', { club_id: club.id, user_id: m.user_id })}>Remove</ConfirmButton>}</td></tr>)}
        </tbody></table></div>
      </div>
      {eventAdmins.length > 0 && (
        <div className="card"><div className="pad"><h3>Event admins</h3></div>
          <div className="tscroll"><table className="list"><tbody>
            {eventAdmins.map((a) => <tr key={a.event_id + a.user_id}><td>{a.email || 'Admin'}</td><td>{evName(a.event_id)}</td><td className="r"><ConfirmButton className="link" confirmText="Tap again to remove" onConfirm={() => remove('event_admins', { event_id: a.event_id, user_id: a.user_id })}>Remove</ConfirmButton></td></tr>)}
          </tbody></table></div>
        </div>
      )}
      {pending.length > 0 && (
        <div className="card"><div className="pad"><h3>Invites not yet accepted</h3></div>
          <div className="tscroll"><table className="list"><tbody>
            {pending.map((i) => <tr key={i.id}><td>{i.email || 'No email noted'}</td><td>{i.role === 'club_admin' ? 'Club admin' : evName(i.event_id)}</td><td style={{ minWidth: 260 }}><CopyField value={inviteUrl(i.token)} /></td><td className="r"><button type="button" className="link" onClick={() => remove('invites', { id: i.id })}>Cancel</button></td></tr>)}
          </tbody></table></div>
        </div>
      )}
    </div>
  );
}

function ClubTab({ club, reload, toast }) {
  const [f, setF] = useState({ name: club.name, location: club.location || '' }); const [busy, setBusy] = useState(false);
  const save = async (e) => { e.preventDefault(); setBusy(true); const { error } = await supabase.from('clubs').update({ name: f.name.trim(), location: f.location.trim() || null }).eq('id', club.id); setBusy(false); if (error) toast(errText(error)); else { toast('Saved'); reload(); } };
  const logo = async (file) => { try { const url = await uploadLogo('clubs/' + club.id, file); const { error } = await supabase.from('clubs').update({ logo_url: url }).eq('id', club.id); if (error) throw error; toast('Logo updated'); reload(); } catch (e) { toast(errText(e)); } };
  return (
    <form className="card form" onSubmit={save}>
      <h2>Club details</h2>
      <div className="grid2">
        <label className="f">Club name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="f">Town or area<input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
      </div>
      <div className="row">
        {club.logo_url && <img src={club.logo_url} alt="Club logo" style={{ height: 64, background: '#fff', borderRadius: 8, padding: 4 }} />}
        <label className="btn ghost filebtn">{club.logo_url ? 'Replace club logo' : 'Upload club logo'}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && logo(e.target.files[0])} /></label>
      </div>
      <div><button className="btn" disabled={busy}>Save</button></div>
    </form>
  );
}
