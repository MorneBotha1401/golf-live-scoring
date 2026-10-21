import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ensureSession, errText, supabase } from '../lib/supabase.js';
import { defaultTee } from '../lib/presets.js';
import { Header, Loading } from '../components/ui.jsx';

export default function JoinPage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const [ev, setEv] = useState(undefined); const [course, setCourse] = useState(null); const [club, setClub] = useState(null);
  const [f, setF] = useState({ name: '', hi: '', gender: 'M', cat: 'open', tee: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('events').select('*').eq('slug', slug).maybeSingle();
      setEv(data || null);
      if (data) {
        const [{ data: c }, { data: cl }] = await Promise.all([supabase.from('courses').select('*').eq('id', data.course_id).single(), supabase.from('clubs').select('*').eq('id', data.club_id).single()]);
        setCourse(c); setClub(cl); setF((x) => ({ ...x, tee: defaultTee(c?.tees || [], 'M') }));
      }
    })();
  }, [slug]);

  if (ev === undefined) return <Loading />;
  if (!ev) return <main><div className="wrap"><div className="card"><div className="empty"><b>Event not found</b>Check the link or QR code.</div></div></div></main>;
  const open = ev.self_register && ['draft', 'live'].includes(ev.status);
  const set = (k) => (e) => setF((x) => {
    const n = { ...x, [k]: e.target.value };
    if (k === 'gender') n.tee = defaultTee(course?.tees || [], e.target.value);
    return n;
  });

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await ensureSession();
      const hi = String(f.hi).trim().replace(',', '.'); const hiNum = hi.startsWith('+') ? -parseFloat(hi.slice(1)) : parseFloat(hi);
      const { data, error } = await supabase.rpc('register_player', { p_slug: slug, p_name: f.name, p_hi: hiNum, p_gender: f.gender, p_cat: f.cat, p_tee: f.tee, p_phone: f.phone || null, p_email: f.email || null });
      if (error) throw error;
      try { localStorage.setItem('player:' + slug, data.player_id); } catch { /* ignore */ }
      nav(`/play/${slug}`, { replace: true });
    } catch (x) { setErr(errText(x)); }
    setBusy(false);
  };

  return (
    <>
      <Header title={ev.name} sub={`${club?.name || ''} · Player registration`} logo={ev.logo_url || club?.logo_url} />
      <main><div className="wrap">
        {!open ? <div className="card"><div className="empty"><b>Registration is closed</b>Ask the organiser to add you to the field.</div></div> : (
          <form className="card form" onSubmit={submit}>
            <h2>Register to play</h2>
            <ol className="howto">
              <li><b>Fill in your details</b><span>Name and handicap index are all that's needed.</span></li>
              <li><b>{ev.auto_approve ? 'You go straight onto the field' : 'The organiser approves you'}</b><span>{ev.auto_approve ? 'No waiting.' : 'You can open your card meanwhile, but not score yet.'}</span></li>
              <li><b>This phone opens your scorecard</b><span>Bookmark the page or add it to your home screen.</span></li>
            </ol>
            <p className="note">{ev.auto_approve ? "You'll go straight onto the field." : 'The organiser will approve your entry before you can score.'} After registering, this phone opens your scorecard.</p>
            <label className="f">Full name<input required minLength={2} maxLength={60} value={f.name} onChange={set('name')} autoComplete="name" /></label>
            <div className="grid2">
              <label className="f">Handicap index<input required inputMode="decimal" placeholder="e.g. 12.4 or +1.2" value={f.hi} onChange={set('hi')} /></label>
              <label className="f">Gender<select value={f.gender} onChange={set('gender')}><option value="M">Male</option><option value="F">Female</option></select></label>
              <label className="f">Category<select value={f.cat} onChange={set('cat')}><option value="open">Adult</option><option value="junior">Junior</option><option value="senior">Senior</option></select></label>
              <label className="f">Tee<select value={f.tee} onChange={set('tee')}>{(course?.tees || []).map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select></label>
              <label className="f">Mobile (optional)<input type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" /></label>
              <label className="f">Email (optional)<input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></label>
            </div>
            {err && <div className="banner bad">{err}</div>}
            <div><button className="btn" type="submit" disabled={busy}>{busy ? 'Registering…' : 'Register'}</button></div>
            <p className="note">Your mobile and email are only visible to the organiser, to send you your scorecard link.</p>
          </form>
        )}
      </div></main>
    </>
  );
}
