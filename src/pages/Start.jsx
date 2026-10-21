import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { errText, isRealUser, supabase } from '../lib/supabase.js';
import { DEFAULT_SETTINGS, FORMATS } from '../lib/engine.js';
import { BRAND, money } from '../lib/brand.js';
import { Header, Loading, useSession, useToast } from '../components/ui.jsx';
import CoursePicker from '../components/CoursePicker.jsx';

const KINDS = [['company', 'Company or corporate'], ['charity', 'Charity or fundraiser'], ['club', 'Golf club or society'], ['school', 'School or university'], ['other', 'Something else']];
const COUNTRIES = [['ZA', 'South Africa'], ['US', 'United States'], ['GB', 'United Kingdom'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['IE', 'Ireland'], ['CA', 'Canada'], ['NA', 'Namibia'], ['BW', 'Botswana'], ['ZW', 'Zimbabwe'], ['KE', 'Kenya'], ['AE', 'United Arab Emirates'], ['DE', 'Germany'], ['NL', 'Netherlands'], ['PT', 'Portugal'], ['ES', 'Spain'], ['FR', 'France'], ['IN', 'India'], ['OTHER', 'Another country']];

function Steps({ at }) {
  const names = ['Your email', 'Your organisation', 'Your event'];
  return (
    <ol className="wiz-steps" aria-label="Progress">
      {names.map((n, i) => <li key={n} className={i < at ? 'done' : i === at ? 'now' : ''}><span>{i < at ? '✓' : i + 1}</span>{n}</li>)}
    </ol>
  );
}

function EmailStep() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin + '/start' } });
    setBusy(false); if (error) setErr(errText(error)); else setSent(true);
  };
  return sent ? (
    <div className="card form">
      <h2>Check your email</h2>
      <p>We sent a link to <b>{email}</b>. Open it on this device and you'll come straight back here to set up your event.</p>
      <p className="note">Nothing after a minute? Check your spam folder.</p>
      <div><button type="button" className="link" onClick={() => setSent(false)}>Use a different email</button></div>
    </div>
  ) : (
    <form className="card form" onSubmit={submit}>
      <h2>Start with your email</h2>
      <p className="note">We'll send you a sign-in link. No password to remember. Setting up is free; you only pay when you're ready to open scoring.</p>
      <label className="f">Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      {err && <div className="banner bad">{err}</div>}
      <div><button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send my link'}</button></div>
      <p className="note">Already set up? <Link to="/admin">Go to your events</Link>.</p>
    </form>
  );
}

function OrgStep({ onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', kind: 'company', country: '', location: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const guess = tz.startsWith('Africa/Johannesburg') ? 'ZA' : tz.startsWith('America/') ? 'US' : tz.startsWith('Europe/London') ? 'GB' : tz.startsWith('Australia/') ? 'AU' : '';
    setF((x) => ({ ...x, country: x.country || guess }));
  }, []);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    const { data, error } = await supabase.rpc('create_organisation', { p_name: f.name, p_kind: f.kind, p_country: f.country === 'OTHER' ? null : f.country, p_location: f.location || null });
    setBusy(false); if (error) toast(errText(error)); else onDone(data);
  };
  return (
    <form className="card form" onSubmit={submit}>
      <h2>Who is organising?</h2>
      <p className="note">Your company, charity or club. Its name appears on your events, and everything you set up stays private to it.</p>
      <label className="f">Organisation name<input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Sunshine Children's Fund" /></label>
      <div className="grid2">
        <label className="f">Type<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="f">Country<select required value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}><option value="">Choose…</option>{COUNTRIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="f">Town (optional)<input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
      </div>
      <div><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button></div>
    </form>
  );
}

function EventStep({ org, orgs, setOrg, price }) {
  const toast = useToast(); const nav = useNavigate();
  const [f, setF] = useState({ name: '', date: '', days: 1, format: 'stableford', course: '' });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!f.course) { toast('Choose the course first'); return; }
    setBusy(true);
    const { data, error } = await supabase.from('events').insert({ club_id: org.id, course_id: f.course, name: f.name.trim(), event_date: f.date, days: +f.days, format: f.format, settings: DEFAULT_SETTINGS }).select('id').single();
    setBusy(false); if (error) toast(errText(error)); else nav(`/admin/event/${data.id}#setup`);
  };
  const total = price.cents * (+f.days || 1);
  return (
    <form className="card form" onSubmit={submit}>
      <h2>Your event</h2>
      {orgs.length > 1 && <label className="f">Organisation<select value={org.id} onChange={(e) => setOrg(orgs.find((o) => o.id === e.target.value))}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
      <label className="f">Name of the golf day or tournament<input required minLength={2} maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Sunshine Charity Golf Day" /></label>
      <div className="grid2">
        <label className="f">Date (first day)<input type="date" required value={f.date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label className="f">Days of play<select value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} day{n > 1 ? 's' : ''}</option>)}</select></label>
        <label className="f">Format<select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}>{Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
      </div>
      <p className="note">{FORMATS[f.format].help} You can fine-tune the rules on the next screen.</p>
      <fieldset><legend>Course</legend><CoursePicker clubId={org.id} value={f.course} onPick={(id) => setF((x) => ({ ...x, course: id }))} toast={toast} /></fieldset>
      <div className="banner">Setting up is free. When you're ready, pay <b>{money(total, price.currency)}</b>{+f.days > 1 ? ` (${f.days} days × ${money(price.cents, price.currency)})` : ''} to open scoring. Scoring can be opened from the day before your event.</div>
      <div><button className="btn" disabled={busy || !f.course}>{busy ? 'Creating…' : 'Create my event'}</button></div>
    </form>
  );
}

export default function Start() {
  const session = useSession();
  const [sp] = useSearchParams();
  const [orgs, setOrgs] = useState(null);
  const [org, setOrg] = useState(null);
  const [price, setPrice] = useState(BRAND.defaultPrice);
  useEffect(() => { supabase.from('app_settings').select('price_cents,currency').eq('id', 1).maybeSingle().then(({ data }) => data && setPrice({ cents: data.price_cents, currency: data.currency })); }, []);
  const loadOrgs = async (pick) => {
    const { data } = await supabase.from('club_members').select('clubs(*)').eq('user_id', session.user.id);
    const list = (data || []).map((x) => x.clubs).filter(Boolean);
    setOrgs(list);
    setOrg(list.find((o) => o.id === (pick || sp.get('org'))) || list[0] || null);
  };
  useEffect(() => { if (isRealUser(session)) loadOrgs(); }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined) return <Loading />;
  const at = !isRealUser(session) ? 0 : orgs === null ? 1 : !org ? 1 : 2;
  return (
    <>
      <Header title="Set up your event" sub={BRAND.product} logo="/icons/icon-192.png" right={<span className="hdrlinks"><Link to="/">Home</Link>{isRealUser(session) && <Link to="/admin">My events</Link>}</span>} />
      <main><div className="wrap">
        <Steps at={at} />
        {at === 0 && <EmailStep />}
        {at === 1 && (orgs === null ? <Loading /> : <OrgStep onDone={(id) => loadOrgs(id)} />)}
        {at === 2 && <EventStep org={org} orgs={orgs} setOrg={setOrg} price={price} />}
      </div></main>
    </>
  );
}
