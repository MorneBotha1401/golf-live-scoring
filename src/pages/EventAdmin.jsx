import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { errText, isRealUser, supabase } from '../lib/supabase.js';
import { useEventData } from '../lib/useEvent.js';
import { makeEngine, DEFAULT_SETTINGS, FORMATS, fmtHi } from '../lib/engine.js';
import { uploadLogo } from '../lib/upload.js';
import { parseRows, readFile, splitText, TEMPLATE_CSV } from '../lib/importer.js';
import { defaultTee } from '../lib/presets.js';
import { linksCsv, playerQrSheet, posterPdf, qrDataUrl, saveBlob, slug as slugify } from '../lib/exporter.js';
import { ConfirmButton, CopyField, Header, LiveBadge, Loading, fmtDate, useHashTab, useSession, useToast } from '../components/ui.jsx';
import SettingsForm from '../components/SettingsForm.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import Scorecards from '../components/Scorecards.jsx';
import { Checklist, Help, NextStep, Tip, Tour, Welcome, seenTour, useOnboarding, useTour } from '../components/Guide.jsx';
import { eventAdminHelp } from '../lib/helpContent.js';
import { confirmPayment, paymentOptions, startCheckout } from '../lib/payments.js';
import { BRAND, money } from '../lib/brand.js';

const flag = { get: (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } }, set: (k) => { try { localStorage.setItem(k, '1'); } catch { /* ignore */ } } };

const origin = () => window.location.origin;
const playerUrl = (token) => `${origin()}/p/${token}`;
const waNumber = (phone) => { let d = String(phone || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('0')) d = '27' + d.slice(1); return d; };

export default function EventAdmin() {
  const { eventId } = useParams(); const session = useSession(); const toast = useToast();
  const [tab, go] = useHashTab(['setup', 'brand', 'players', 'links', 'committee', 'board'], 'setup');
  const d = useEventData({ id: eventId });
  const E = useMemo(() => (d.event ? makeEngine(d) : null), [d.event, d.course, d.players, d.scores, d.teamScores]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isClubAdmin, setIsClubAdmin] = useState(false);
  const [priv, setPriv] = useState({});
  const loadPriv = async () => {
    const { data } = await supabase.from('player_private').select('player_id,token,phone,email').eq('event_id', eventId).range(0, 1999);
    const o = {}; (data || []).forEach((r) => (o[r.player_id] = r)); setPriv(o);
  };
  useEffect(() => { if (isRealUser(session)) loadPriv(); }, [session, eventId, d.players.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isRealUser(session) || !d.event) return;
    supabase.from('club_members').select('user_id').eq('club_id', d.event.club_id).eq('user_id', session.user.id).then(({ data }) => setIsClubAdmin(!!data?.length));
  }, [session, d.event?.club_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ob = useOnboarding('eventadmin', !!d.event && isRealUser(session));
  const mainSeen = !ob.welcome && !ob.tour && seenTour('eventadmin');
  const tabTour = useTour('eventadmin-' + tab, mainSeen && !!d.event && ['players', 'links', 'committee', 'board'].includes(tab));
  const [, bump] = useState(0);
  const [settings, setSettings] = useState(null);
  const [payments, setPayments] = useState([]);
  const loadPayments = () => supabase.from('payments').select('*').eq('event_id', eventId).order('created_at', { ascending: false }).then(({ data }) => setPayments(data || []));
  useEffect(() => {
    supabase.from('app_settings').select('price_cents,currency,free_mode').eq('id', 1).maybeSingle().then(({ data }) => setSettings(data || {}));
    if (isRealUser(session)) loadPayments();
  }, [eventId, session]); // eslint-disable-line react-hooks/exhaustive-deps
  // Back from the payment page: confirm with the payment provider and unlock straight away.
  useEffect(() => {
    if (!isRealUser(session)) return undefined;
    const sp = new URLSearchParams(window.location.search);
    const ref = sp.get('paid'); const cancelled = sp.get('cancelled');
    const clean = () => { try { window.history.replaceState(null, '', window.location.pathname + window.location.hash); } catch { /* ignore */ } };
    if (cancelled) { toast('Payment cancelled. You can pay whenever you\'re ready.'); clean(); return undefined; }
    if (!ref) return undefined;
    let tries = 0, on = true;
    toast('Confirming your payment…');
    const check = async () => {
      try { const r = await confirmPayment(ref); if (r.paid) { if (!on) return; toast('Payment received. Scoring is unlocked.'); clean(); d.reload(); loadPayments(); return; } } catch { /* try again */ }
      if (on && ++tries < 15) setTimeout(check, 2000); else if (on) { toast('Your payment is still being confirmed. This page updates by itself.'); clean(); }
    };
    check();
    return () => { on = false; };
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined || d.loading) return <Loading />;
  if (!isRealUser(session)) return <Navigate to={`/login?next=/admin/event/${eventId}`} replace />;
  if (!d.event) return <main><div className="wrap"><div className="card"><div className="empty"><b>Event not found</b>You may not have access to it. <Link to="/admin">Back to my events</Link></div></div></div></main>;
  const ev = d.event;
  const pending = d.players.filter((p) => p.status === 'pending').length;
  const issues = E.issues().filter((x) => x.kind === 'dispute' || x.kind === 'check').length;
  const active = d.players.filter((p) => p.status === 'active');
  const teamFmt = E.isTeam;
  const grouped = active.length > 0 && active.every((p) => p.grp > 0);
  const sent = flag.get('linksSent:' + ev.id);
  const checklist = [
    { key: 'setup', label: 'Check the format and rules', hint: `${FORMATS[ev.format].label}: allowance, divisions, countback and how disagreements are handled. Press Save setup when happy.`, done: !!ev.settings?.reviewed, action: { label: 'Open Setup', onClick: () => go('setup') } },
    { key: 'brand', label: 'Add the company logo and sponsors', hint: 'Shown on phones, the leaderboard, the TV and the PDF.', done: !!ev.logo_url || (ev.sponsors || []).length > 0, optional: true, action: { label: 'Add logos', onClick: () => go('brand') } },
    { key: 'players', label: 'Add the players', hint: 'One by one, or import an Excel or CSV list.', done: active.length > 0, action: { label: 'Add players', onClick: () => go('players') } },
    { key: 'groups', label: ev.format === 'betterball' ? 'Put players into four-balls and pairs' : 'Put players into four-balls', hint: teamFmt ? 'Required for team formats: everyone in the same group number plays as one team.' : 'Players mark the others in their group, so give each four-ball the same group number.', done: grouped, action: { label: 'Set groups', onClick: () => go('players') } },
    { key: 'links', label: 'Send players their personal links', hint: 'WhatsApp, email or a printed QR sheet. Each link opens that player\'s own scorecard.', done: sent, action: { label: 'Open Links & QR', onClick: () => go('links') } },
    { key: 'live', label: 'Open scoring on the day', hint: 'Until then the event is a private draft and nobody can enter scores.', done: ev.status !== 'draft', action: { label: 'Go to Setup', onClick: () => go('setup') } },
    { key: 'tv', label: 'Put the leaderboard on the clubhouse TV', hint: 'Open the TV link on the TV\'s browser or a laptop connected to it.', done: flag.get('tvOpened:' + ev.id), optional: true, action: { label: 'Open TV display', onClick: () => { flag.set('tvOpened:' + ev.id); bump((x) => x + 1); window.open(`/e/${ev.slug}/tv`, '_blank', 'noopener'); } } },
  ];
  const free = !!settings?.free_mode || d.club?.plan === 'comp';
  const paid = (ev.paid_days || 0) >= (ev.days || 1);
  const billing = { free, paid, price: { cents: settings?.price_cents ?? BRAND.defaultPrice.cents, currency: settings?.currency || BRAND.defaultPrice.currency }, payments };
  checklist.splice(checklist.findIndex((x) => x.key === 'live'), 0, {
    key: 'pay', label: free ? 'Payment: none needed' : 'Pay for your event',
    hint: free ? 'This event is free.' : `${money(billing.price.cents * (ev.days || 1), billing.price.currency)} for ${ev.days > 1 ? `${ev.days} event days` : 'the event day'}, any number of players. Unlocks scoring straight away.`,
    done: free || paid, action: { label: 'Pay now', onClick: () => { go('setup'); setTimeout(() => document.getElementById('pay')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200); } },
  });
  const markSent = () => { if (!sent) { flag.set('linksSent:' + ev.id); bump((x) => x + 1); } };
  const steps = [
    { target: '[data-tour="checklist"]', title: 'Follow the checklist', body: <p>The checklist shows what to do next and ticks itself off as you go. The highlighted step is the next one. It folds away once everything's done.</p>, before: () => go('setup') },
    { target: '[data-tour="tabs"]', title: 'The tabs', body: <><p><b>Setup</b>: name, date, format, rules, and opening and closing scoring.</p><p><b>Logos &amp; sponsors</b> · <b>Players</b>: add, import, group, approve · <b>Links &amp; QR</b>: send each player their link · <b>Committee</b>: disputes and official scores · <b>Leaderboard</b>.</p></> },
    { target: '[data-tour="status"]', title: 'Nothing is public until you open scoring', body: <p>In Draft you can set everything up and players can check their details. On the day, press <b>Open scoring</b>. Afterwards, <b>Close scoring</b> to lock the results, then move the event to the archive.</p>, before: () => go('setup') },
    { target: '.helpbtn', title: 'Help is always here', body: <p>Tap <b>?</b> any time for quick answers, or to take this tour again. Each tab also shows you around the first time you open it.</p> },
  ];

  const tabSteps = {
    players: [
      { target: '[data-tour="addplayer"]', title: 'Add players one by one', body: <p>Name and handicap index are all you need. The tee follows gender, and you can change it.</p> },
      { target: '[data-tour="import"]', title: 'Or import the whole field', body: <p>Choose an Excel or CSV file, or paste rows straight from Excel. You'll see a preview, with any problem rows flagged, before anything is saved. <b>Download template</b> shows the columns.</p> },
      { target: '[data-tour="field"]', title: 'Edit the field here', body: <p>Change any name, handicap, tee or group right in the table; it saves when you click away. Give each four-ball the same <b>group number</b>. Approve self-registered players here too.</p> },
    ],
    links: [
      { target: '[data-tour="eventlinks"]', title: 'Links for everyone else', body: <p>The <b>leaderboard</b> link is for spectators, the <b>TV</b> link is for the clubhouse screen{ev.self_register ? ', and the registration QR lets players sign themselves up' : ''}. Each has a QR code and a printable A4 poster.</p> },
      { target: '[data-tour="qrsheet"]', title: 'Send each player their own link', body: <p>Print the <b>QR sheet</b> and hand out codes at registration, or download the links for a mail merge.</p> },
      { target: '[data-tour="sendlinks"]', title: 'Or send them one at a time', body: <p>Tap <b>WhatsApp</b> or <b>Email</b> next to a player. The message and link are filled in for you. <b>New link</b> replaces a link that went astray.</p> },
    ],
    committee: [
      { target: '[data-tour="stats"]', title: 'The round at a glance', body: <p>How many have started, finished and signed, and how many holes are disputed.</p> },
      { target: '[data-tour="attention"]', title: 'Sort out problems', body: <p>Disagreements between player and marker, unlikely scores, missing holes and unsigned cards land here. One tap on <b>Use 5</b> or <b>Use 6</b> sets the official score.</p> },
      { target: '[data-tour="official"]', title: 'Correct any hole', body: <p>Set an official score for any player and hole, even after a card is signed. It overrides both entries.</p> },
      { target: '[data-tour="log"]', title: 'Every change is recorded', body: <p>Who entered what, and when. Useful if there's a question afterwards.</p> },
    ],
    board: [
      { target: '[data-tour="lbexport"]', title: 'Share the results', body: <p>Download a <b>PDF</b> to print, an <b>image</b> for WhatsApp, or copy the results as text. If you pick a division or category first, you get just that list.</p> },
      { target: '[data-tour="lbtable"]', title: 'Tap a row for the card', body: <p>Every row opens that player's or team's card, hole by hole, with net scores and points.</p> },
    ],
  };
  const sentNow = sent;
  let next = null;
  if (tab === 'players' && active.length && !grouped) next = <NextStep>Give each four-ball the same group number in the <b>Group</b> column of the field below.</NextStep>;
  else if (tab === 'players' && active.length && grouped && !sentNow) next = <NextStep action={{ label: 'Open Links & QR', onClick: () => go('links') }}>Send every player their personal link.</NextStep>;
  else if (tab === 'brand' && !active.length) next = <NextStep action={{ label: 'Add players', onClick: () => go('players') }}>Add the players.</NextStep>;
  else if (tab === 'links' && sentNow && ev.status === 'draft') next = <NextStep action={{ label: 'Go to Setup', onClick: () => go('setup') }}>On the day, open scoring so players can start entering scores.</NextStep>;
  else if (tab === 'setup' && ev.status === 'live') next = <NextStep action={{ label: 'Open TV display', onClick: () => { flag.set('tvOpened:' + ev.id); bump((x) => x + 1); window.open(`/e/${ev.slug}/tv`, '_blank', 'noopener'); } }}>Scoring is open. Put the leaderboard on the clubhouse TV, and keep an eye on <b>Committee</b> for disputed scores.</NextStep>;
  else if (tab === 'setup' && ev.status === 'finished') next = <NextStep action={{ label: 'Open Leaderboard', onClick: () => go('board') }}>Download or share the results, then move the event to the archive below.</NextStep>;
  else if (tab === 'committee' && ev.status === 'live' && E.active.length && E.active.every((p) => p.attested_at)) next = <NextStep action={{ label: 'Go to Setup', onClick: () => go('setup') }}>Every card is signed and attested. Close scoring to finalise the results.</NextStep>;

  return (
    <>
      <Header title={ev.name} sub={`${d.club?.name || ''} · ${fmtDate(ev.event_date)} · Event admin`} logo={ev.logo_url || d.club?.logo_url} status={<LiveBadge event={ev} />}
        right={<span className="hdrlinks">{isClubAdmin ? <Link to={`/admin/club/${ev.club_id}`}>Club</Link> : <Link to="/admin">My events</Link>}<Help topics={eventAdminHelp} title="Help running this event" intro="Quick answers. Tap a question to open it." onTour={ob.startTour} /></span>}
        tabs={[['setup', 'Setup'], ['brand', 'Logos & sponsors'], ['players', `Players (${d.players.length}${pending ? ', ' + pending + ' to approve' : ''})`], ['links', 'Links & QR'], ['committee', `Committee${issues ? ' (' + issues + ')' : ''}`], ['board', 'Leaderboard']]}
        current={tab} onTab={go} />
      <Welcome open={ob.welcome} title="Your event control room" onTour={ob.startTour} onSkip={ob.skip}
        intro={<p>Everything for <b>{ev.name}</b> is run from here. Getting it ready takes five steps:</p>}
        steps={[
          { title: 'Check the format and rules', text: 'Setup tab: format, handicap allowance, divisions, countback.' },
          { title: 'Add the players', text: 'One by one, or import an Excel list. Give each four-ball a group number.' },
          { title: 'Send each player their link', text: 'Links & QR tab: WhatsApp, email or a printed QR sheet.' },
          { title: 'Pay and open scoring on the day', text: 'Setting up is free. Pay per event day when you\'re ready; until scoring opens it\'s a private draft.' },
          { title: 'Close scoring and share the results', text: 'PDF, image or text, then archive the event.' },
        ]} />
      <Tour steps={steps} open={ob.tour} onClose={ob.closeTour} />
      <Tour steps={tabSteps[tab] || []} open={tabTour.open && !!tabSteps[tab]} onClose={tabTour.close} />
      <main><div className="wrap wide">
        {tab !== 'board' && <div data-tour="checklist"><Checklist id={'event:' + ev.id} title="Get this event ready" items={checklist} intro="Work down the list. Steps tick themselves off as you complete them." /></div>}
        {next}
        {ev.status === 'draft' && tab !== 'setup' && <div className="banner warn spread"><span><b>Draft:</b> players can open their links but can't enter scores until you open scoring.</span><button type="button" className="btn small" onClick={() => go('setup')}>Go to Setup</button></div>}
        {tab === 'setup' && <SetupTab {...{ d, E, ev, toast, isClubAdmin, billing }} />}
        {tab === 'brand' && <BrandTab {...{ ev, toast, reload: d.reload }} />}
        {tab === 'players' && <PlayersTab {...{ d, E, ev, toast, priv, loadPriv }} />}
        {tab === 'links' && <LinksTab {...{ d, E, ev, toast, priv, loadPriv, markSent }} />}
        {tab === 'committee' && <CommitteeTab {...{ d, E, ev, toast }} />}
        {tab === 'board' && <><Leaderboard E={E} event={ev} club={d.club} tvHref={`/e/${ev.slug}/tv`} /><h2>Scorecards</h2><Scorecards E={E} /></>}
      </div></main>
    </>
  );
}

/* ---------------- payment ---------------- */
const shortDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
function addDays(d, n) { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }

function PayCard({ ev, billing, toast }) {
  const { free, paid, price, payments } = billing;
  const [opts, setOpts] = useState(null);
  const [busy, setBusy] = useState('');
  const owed = Math.max(0, ev.days - (ev.paid_days || 0));
  useEffect(() => { if (!free && owed > 0) paymentOptions().then(setOpts).catch(() => setOpts({ gateways: [] })); }, [free, owed]);
  const done = payments.filter((p) => p.status === 'paid' || p.status === 'refunded');
  const window_ = `${shortDate(addDays(ev.event_date, -1))} to ${shortDate(addDays(ev.event_date, ev.days))}`;
  const pay = async (gw) => { setBusy(gw || 'any'); try { await startCheckout(ev.id, gw); } catch (e) { toast(e.message); setBusy(''); } };
  if (free) return <div className="card form paycard paid" id="pay"><h2>No payment needed</h2><p>This event is free. You can open scoring whenever you're ready.</p></div>;
  const unit = opts?.price?.cents ?? price.cents; const cur = opts?.price?.currency || price.currency;
  return (
    <div className={'card form paycard' + (paid ? ' paid' : '')} id="pay">
      {paid ? (
        <>
          <h2>Paid · scoring unlocked</h2>
          <p>Your event day pass{ev.days > 1 ? 'es cover' : ' covers'} {ev.days > 1 ? `all ${ev.days} days` : 'the event'}. Scoring can be opened from {window_}.</p>
        </>
      ) : (
        <>
          <h2>Pay for your event</h2>
          <div className="spread">
            <div><div className="amount">{money(unit * owed, cur)}</div><div className="note">{owed > 1 ? `${owed} event days × ${money(unit, cur)}` : 'One event day pass'}{ev.paid_days > 0 ? ` (${ev.paid_days} already paid)` : ''}</div></div>
            <div className="btns">
              {opts === null ? <button type="button" className="btn" disabled>Loading…</button>
                : opts.gateways?.length ? opts.gateways.map((g, i) => (
                  <button key={g.id} type="button" className={'btn' + (i ? ' ghost' : '')} disabled={!!busy} onClick={() => pay(g.id)}>
                    {busy === g.id ? 'Opening secure checkout…' : i ? `Pay another way: ${g.label}` : `Pay ${money(g.currency === 'zar' ? (opts.price.zarCents * owed) : unit * owed, g.currency)}`}
                  </button>))
                : <span className="note">Online payment isn't switched on yet. Contact {BRAND.email}.</span>}
            </div>
          </div>
          <p className="note">Unlimited players. Paying unlocks <b>Open scoring</b> straight away; scoring can be opened from {window_}. Secure checkout by card, Apple Pay or Google Pay, with a receipt by email.</p>
        </>
      )}
      {done.length > 0 && (
        <div className="tscroll"><table className="list"><thead><tr><th>Paid</th><th>Days</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>
          {done.map((p) => <tr key={p.id}><td>{p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-ZA') : '—'}</td><td>{p.days}</td><td>{money(p.amount_cents, p.currency)}</td><td>{p.status === 'refunded' ? 'Refunded' : p.provider === 'comp' ? 'Complimentary' : 'Paid'}</td><td>{p.receipt_url && <a href={p.receipt_url} target="_blank" rel="noreferrer">Receipt</a>}</td></tr>)}
        </tbody></table></div>
      )}
    </div>
  );
}

/* ---------------- setup ---------------- */
function SetupTab({ d, E, ev, toast, isClubAdmin, billing }) {
  const [f, setF] = useState({ name: ev.name, event_date: ev.event_date, days: ev.days || 1, course_id: ev.course_id, self_register: ev.self_register, auto_approve: ev.auto_approve });
  const [fs, setFs] = useState({ format: ev.format, settings: { ...DEFAULT_SETTINGS, ...ev.settings } });
  const [courses, setCourses] = useState([]); const [busy, setBusy] = useState(false); const [admins, setAdmins] = useState([]);
  useEffect(() => {
    supabase.from('courses').select('id,name,holes').eq('club_id', ev.club_id).then(({ data }) => setCourses(data || []));
    supabase.from('event_admins').select('*').eq('event_id', ev.id).then(({ data }) => setAdmins(data || []));
  }, [ev.club_id, ev.id]);
  const hasScores = d.scores.length + d.teamScores.length > 0;
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from('events').update({ ...f, days: +f.days, name: f.name.trim(), format: fs.format, settings: { ...fs.settings, reviewed: true } }).eq('id', ev.id);
    setBusy(false); if (error) toast(errText(error)); else { toast('Saved. The leaderboard has been recalculated.'); d.reload(); }
  };
  const status = async (s) => { const { error } = await supabase.from('events').update({ status: s }).eq('id', ev.id); if (error) toast(errText(error)); else { toast({ live: 'Scoring is open', finished: 'Scoring closed. Results are final.', archived: 'Moved to the archive', draft: 'Back to draft' }[s]); d.reload(); } };
  const del = async () => { const { error } = await supabase.from('events').delete().eq('id', ev.id); if (error) toast(errText(error)); else window.location.assign(`/admin/club/${ev.club_id}`); };
  const course = courses.find((c) => c.id === f.course_id) || d.course;

  return (
    <div className="stack">
      <PayCard ev={ev} billing={billing} toast={toast} />
      <div className="card form" data-tour="status">
        <h2>Event status</h2>
        {ev.status === 'draft' && <><p>Draft: players can open their links and check their details, but can't score yet. The public leaderboard is hidden.</p><div className="btns">{billing.free || billing.paid
          ? <ConfirmButton className="btn" confirmText="Tap again to open scoring" onConfirm={() => status('live')}>Open scoring (go live)</ConfirmButton>
          : <button type="button" className="btn ghost" onClick={() => document.getElementById('pay')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Pay to unlock scoring</button>}</div>
          {!billing.free && <p className="note">Scoring can be opened from {shortDate(addDays(ev.event_date, -1))} to {shortDate(addDays(ev.event_date, ev.days))}.</p>}</>}
        {ev.status === 'live' && <><p>Live: players are scoring and the leaderboard is public.</p><div className="btns"><ConfirmButton className="btn" confirmText="Tap again to close scoring" onConfirm={() => status('finished')}>Close scoring and finalise</ConfirmButton><button type="button" className="btn ghost" onClick={() => status('draft')}>Back to draft</button></div></>}
        {ev.status === 'finished' && <><p>Finished: scores are locked for players. You can still correct scores in Committee.</p><div className="btns"><button type="button" className="btn ghost" onClick={() => status('live')}>Reopen scoring</button><button type="button" className="btn" onClick={() => status('archived')}>Move to archive</button></div></>}
        {ev.status === 'archived' && <><p>Archived: kept with full results in the club's archive.</p><div className="btns"><button type="button" className="btn ghost" onClick={() => status('finished')}>Restore</button></div></>}
      </div>

      <div className="card form">
        <h2>Event details</h2>
        <label className="f">Tournament or golf day name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <div className="grid2">
          <label className="f">Date (first day)<input type="date" value={f.event_date} disabled={hasScores} onChange={(e) => setF({ ...f, event_date: e.target.value })} /></label>
          <label className="f">Days of play<select value={f.days} disabled={hasScores} onChange={(e) => setF({ ...f, days: +e.target.value })}>{[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} day{n > 1 ? 's' : ''}</option>)}</select></label>
          <label className="f">Course<select value={f.course_id} disabled={hasScores} onChange={(e) => setF({ ...f, course_id: e.target.value })}>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        </div>
        {hasScores && <p className="note">The date, days and course can't change once scores have been entered.</p>}
        {!billing.free && +f.days > (ev.paid_days || 0) && ev.paid_days > 0 && <p className="note">Adding days means paying for the extra days before scoring can open again.</p>}
        <fieldset><legend>Player registration</legend>
          <label className="chk"><input type="checkbox" checked={f.self_register} onChange={(e) => setF({ ...f, self_register: e.target.checked })} /> Let players register themselves from the event QR code</label>
          {f.self_register && <label className="chk"><input type="checkbox" checked={f.auto_approve} onChange={(e) => setF({ ...f, auto_approve: e.target.checked })} /> Approve them automatically (otherwise you approve each one under Players)</label>}
        </fieldset>
      </div>

      <div className="card form">
        <h2>Format &amp; rules</h2>
        <SettingsForm value={fs} onChange={setFs} course={course} />
        {hasScores && fs.format !== ev.format && <div className="banner warn">Changing the format after scoring has started recalculates everything. Team formats need players in groups{fs.format === 'betterball' ? ' and pairs' : ''}.</div>}
      </div>
      <div className="btns"><button type="button" className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save setup'}</button></div>

      <div className="card form">
        <h2>Event admins</h2>
        {admins.length ? <ul>{admins.map((a) => <li key={a.user_id}>{a.email || 'Admin'}</li>)}</ul> : <p className="note">No extra event admins yet.</p>}
        {isClubAdmin ? <p className="note">Invite helpers for this event under <Link to={`/admin/club/${ev.club_id}#people`}>Club → Admins &amp; invites</Link>.</p> : <p className="note">Ask the club admin to invite more helpers.</p>}
      </div>
      {isClubAdmin && <div><ConfirmButton confirmText="Tap again to delete this event and all its scores" onConfirm={del}>Delete event</ConfirmButton></div>}
      <p className="note">{FORMATS[ev.format].label} · {E.describe()}</p>
    </div>
  );
}

/* ---------------- branding ---------------- */
function BrandTab({ ev, toast, reload }) {
  const [sp, setSp] = useState(ev.sponsors || []); const [busy, setBusy] = useState(false);
  const setLogo = async (file) => { try { const url = await uploadLogo('events/' + ev.id, file); const { error } = await supabase.from('events').update({ logo_url: url }).eq('id', ev.id); if (error) throw error; toast('Event logo updated'); reload(); } catch (e) { toast(errText(e)); } };
  const clearLogo = async () => { const { error } = await supabase.from('events').update({ logo_url: null }).eq('id', ev.id); if (error) toast(errText(error)); else reload(); };
  const spLogo = async (i, file) => { try { const url = await uploadLogo('events/' + ev.id, file); setSp((x) => x.map((s, k) => (k === i ? { ...s, logo_url: url } : s))); } catch (e) { toast(errText(e)); } };
  const saveSp = async () => { setBusy(true); const { error } = await supabase.from('events').update({ sponsors: sp.filter((s) => s.name || s.logo_url) }).eq('id', ev.id); setBusy(false); if (error) toast(errText(error)); else { toast('Sponsors saved'); reload(); } };
  return (
    <div className="stack">
      <div className="card form">
        <h2>Event logo</h2>
        <p className="note">Shown on the players' phones, the leaderboard, the clubhouse TV and the PDF. Use the company or tournament logo, e.g. the BMW roundel.</p>
        <div className="row">
          {ev.logo_url && <img src={ev.logo_url} alt="Event logo" style={{ height: 80, background: '#fff', borderRadius: 8, padding: 6 }} />}
          <label className="btn ghost filebtn">{ev.logo_url ? 'Replace logo' : 'Upload logo'}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && setLogo(e.target.files[0])} /></label>
          {ev.logo_url && <button type="button" className="link" onClick={clearLogo}>Remove</button>}
        </div>
      </div>
      <div className="card form">
        <h2>Sponsors</h2>
        <p className="note">Sponsor logos run along the bottom of the leaderboard and the TV display.</p>
        {sp.map((s, i) => (
          <div key={i} className="row">
            {s.logo_url && <img src={s.logo_url} alt="" style={{ height: 44, background: '#fff', borderRadius: 6, padding: 3 }} />}
            <input className="pick" style={{ flex: 1, minWidth: 160 }} placeholder="Sponsor name" value={s.name || ''} onChange={(e) => setSp((x) => x.map((y, k) => (k === i ? { ...y, name: e.target.value } : y)))} aria-label="Sponsor name" />
            <label className="btn ghost small filebtn">{s.logo_url ? 'Replace logo' : 'Upload logo'}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && spLogo(i, e.target.files[0])} /></label>
            <button type="button" className="link" onClick={() => setSp((x) => x.filter((_, k) => k !== i))}>Remove</button>
          </div>
        ))}
        <div className="btns"><button type="button" className="btn ghost" onClick={() => setSp([...sp, { name: '', logo_url: '' }])}>Add sponsor</button><button type="button" className="btn" disabled={busy} onClick={saveSp}>Save sponsors</button></div>
      </div>
    </div>
  );
}

/* ---------------- players ---------------- */
function PlayersTab({ d, E, ev, toast, priv, loadPriv }) {
  const tees = d.course?.tees || [];
  const blank = { name: '', hi: '', gender: 'M', cat: 'open', tee: defaultTee(tees, 'M'), grp: '', pair: 'A', phone: '', email: '' };
  const [f, setF] = useState(blank); const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState(null); const [paste, setPaste] = useState(''); const [auto, setAuto] = useState(true); const [prog, setProg] = useState('');
  const [q, setQ] = useState(''); const [show, setShow] = useState('all');
  const maxGrp = d.players.reduce((m, p) => Math.max(m, p.grp || 0), 0);
  const rows = useMemo(() => (raw ? parseRows(raw, { tees, autoGroup: auto, existingMaxGroup: maxGrp }) : null), [raw, auto, tees, maxGrp]);
  const bb = ev.format === 'betterball';

  const add = async (e) => {
    e.preventDefault(); setBusy(true);
    const hi = String(f.hi).replace(',', '.'); const hiNum = hi.startsWith('+') ? -parseFloat(hi.slice(1)) : parseFloat(hi);
    const { data, error } = await supabase.from('players').insert({ event_id: ev.id, name: f.name.trim(), hi: hiNum, gender: f.gender, cat: f.cat, tee: f.tee, grp: parseInt(f.grp) || 0, pair: f.pair }).select('id').single();
    if (!error && (f.phone || f.email)) await supabase.from('player_private').update({ phone: f.phone || null, email: f.email || null }).eq('player_id', data.id);
    setBusy(false); if (error) toast(errText(error)); else { toast('Player added'); setF({ ...blank, grp: f.grp, tee: f.tee, gender: f.gender }); d.reload(); loadPriv(); }
  };
  const doImport = async () => {
    const list = rows.filter((r) => !r.err); let n = 0;
    try {
      for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100);
        const { data, error } = await supabase.from('players').insert(chunk.map((p) => ({ event_id: ev.id, name: p.name, hi: p.hi, gender: p.gender, cat: p.cat, tee: p.tee, grp: p.grp, pair: p.pair }))).select('id');
        if (error) throw error;
        const contacts = data.map((r, k) => ({ player_id: r.id, event_id: ev.id, phone: chunk[k].phone || null, email: chunk[k].email || null })).filter((c) => c.phone || c.email);
        if (contacts.length) { const { error: e2 } = await supabase.from('player_private').upsert(contacts, { onConflict: 'player_id' }); if (e2) throw e2; }
        n += chunk.length; setProg(`Imported ${n} of ${list.length}…`);
      }
      toast(`Imported ${n} players`); setRaw(null); setPaste('');
    } catch (e) { toast(`Imported ${n}, then stopped: ${errText(e)}`); }
    setProg(''); d.reload(); loadPriv();
  };
  const update = async (p, patch) => { const { error } = await supabase.from('players').update(patch).eq('id', p.id); if (error) toast(errText(error)); };
  const remove = async (p) => { const { error } = await supabase.from('players').delete().eq('id', p.id); if (error) toast(errText(error)); else d.reload(); };
  const reopen = async (p) => { const { error } = await supabase.from('players').update({ signed_at: null, attested_at: null, attested_by: null }).eq('id', p.id); if (error) toast(errText(error)); else toast(`${p.name}'s card reopened`); };
  const approveAll = async () => { const { error } = await supabase.from('players').update({ status: 'active' }).eq('event_id', ev.id).eq('status', 'pending'); if (error) toast(errText(error)); else toast('All pending players approved'); };

  const list = d.players.filter((p) => (show === 'all' || p.status === show || (show === 'nogroup' && !p.grp)) && p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || (a.grp || 999) - (b.grp || 999) || a.pair.localeCompare(b.pair) || a.name.localeCompare(b.name));
  const pendingN = d.players.filter((p) => p.status === 'pending').length;

  return (
    <div className="stack">
      <form className="card form" onSubmit={add} data-tour="addplayer">
        <h2>Add a player</h2>
        <Tip id="players-groups">Give everyone in the same four-ball the <b>same group number</b>. Players can then mark each other, and team formats know who plays together. Use 0 if you'll group them later.</Tip>
        <div className="grid2">
          <label className="f">Name<input required maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="f">Handicap index<input required inputMode="decimal" placeholder="12.4 or +1.2" value={f.hi} onChange={(e) => setF({ ...f, hi: e.target.value })} /></label>
          <label className="f">Gender<select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value, tee: defaultTee(tees, e.target.value) })}><option value="M">Male</option><option value="F">Female</option></select></label>
          <label className="f">Category<select value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}><option value="open">Adult</option><option value="junior">Junior</option><option value="senior">Senior</option></select></label>
          <label className="f">Tee<select value={f.tee} onChange={(e) => setF({ ...f, tee: e.target.value })}>{tees.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select></label>
          <label className="f">Group (four-ball)<input type="number" min="0" max="200" value={f.grp} onChange={(e) => setF({ ...f, grp: e.target.value })} placeholder="0 = later" /></label>
          {bb && <label className="f">Pair<select value={f.pair} onChange={(e) => setF({ ...f, pair: e.target.value })}><option value="A">Pair A</option><option value="B">Pair B</option></select></label>}
          <label className="f">Mobile (for WhatsApp link)<input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <label className="f">Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        </div>
        <div><button className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add player'}</button></div>
      </form>

      <div className="card form" data-tour="import">
        <h2>Import from a spreadsheet</h2>
        <p className="note">Excel (.xlsx) or CSV with a <b>Name</b> and a <b>Handicap index</b> column. Optional columns: Gender, Category (junior / senior), Tee, Group, Pair, Mobile, Email. Afrikaans headings work too.</p>
        <div className="btns">
          <label className="btn ghost filebtn">Choose spreadsheet<input type="file" accept=".xlsx,.xls,.csv,.txt" hidden onChange={async (e) => { const file = e.target.files[0]; e.target.value = ''; if (!file) return; try { setRaw(await readFile(file)); } catch { toast("Couldn't read that file. Save it as .xlsx or .csv and try again."); } }} /></label>
          <button type="button" className="btn ghost" onClick={() => saveBlob(new Blob([TEMPLATE_CSV], { type: 'text/csv' }), 'players-template.csv')}>Download template</button>
        </div>
        <label className="f">Or paste rows from Excel<textarea value={paste} onChange={(e) => { setPaste(e.target.value); setRaw(e.target.value.trim() ? splitText(e.target.value) : null); }} placeholder={'Name\tHandicap index\nPieter Venter\t12.4'} /></label>
        <label className="chk"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Put players into groups of 4 in list order when there's no Group column</label>
        {rows && (
          <div className="stack">
            <div className="prev-scroll"><table className="list"><thead><tr><th>Name</th><th>HI</th><th>Gender</th><th>Category</th><th>Tee</th><th>Group</th>{bb && <th>Pair</th>}<th>Contact</th><th /></tr></thead><tbody>
              {rows.slice(0, 400).map((p, i) => <tr key={i} className={p.err ? 'bad' : ''}><td>{p.name || '—'}</td><td className="num">{p.hi == null ? '—' : fmtHi(p.hi)}</td><td>{p.err ? '' : p.gender}</td><td>{p.err ? '' : { open: 'Adult', junior: 'Junior', senior: 'Senior' }[p.cat]}</td><td>{p.err ? '' : tees.find((t) => t.code === p.tee)?.label}</td><td>{p.err ? '' : p.grp || '—'}</td>{bb && <td>{p.err ? '' : p.pair}</td>}<td>{p.phone || p.email ? '✓' : ''}</td><td>{p.err}</td></tr>)}
            </tbody></table></div>
            <p className="note">{rows.filter((r) => !r.err).length} ready{rows.some((r) => r.err) ? ` · ${rows.filter((r) => r.err).length} will be skipped` : ''}. Check tees and groups before importing.</p>
            <div className="btns"><button type="button" className="btn" disabled={!!prog || !rows.some((r) => !r.err)} onClick={doImport}>{prog || `Import ${rows.filter((r) => !r.err).length} players`}</button><button type="button" className="btn ghost" onClick={() => { setRaw(null); setPaste(''); }}>Cancel</button></div>
          </div>
        )}
      </div>

      <div className="card" data-tour="field">
        <div className="pad spread">
          <h2>Field ({d.players.length})</h2>
          <div className="row">
            <input className="pick" style={{ width: 200 }} placeholder="Search names" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
            <select className="pick" style={{ width: 170 }} value={show} onChange={(e) => setShow(e.target.value)} aria-label="Show"><option value="all">Everyone</option><option value="pending">To approve ({pendingN})</option><option value="nogroup">Not in a group</option><option value="withdrawn">Withdrawn</option></select>
            {pendingN > 0 && <button type="button" className="btn small" onClick={approveAll}>Approve all {pendingN}</button>}
          </div>
        </div>
        <div className="tscroll"><table className="list">
          <thead><tr><th>Name</th><th>HI</th><th>Tee</th><th>Gender</th><th>Cat.</th><th>Group</th>{bb && <th>Pair</th>}<th>HC</th><th>Status</th><th>Card</th><th /></tr></thead>
          <tbody>{list.map((p) => {
            const e = E.players.find((x) => x.id === p.id); const { ch, ph } = E.handicaps(e);
            return (
              <tr key={p.id}>
                <td style={{ minWidth: 160 }}><input defaultValue={p.name} onBlur={(x) => x.target.value.trim() && x.target.value !== p.name && update(p, { name: x.target.value.trim() })} aria-label="Name" /></td>
                <td><input defaultValue={fmtHi(p.hi)} key={p.hi} style={{ width: 70 }} inputMode="decimal" onBlur={(x) => { const v = String(x.target.value).replace(',', '.'); const n = v.startsWith('+') ? -parseFloat(v.slice(1)) : parseFloat(v); if (isFinite(n) && n !== +p.hi) update(p, { hi: n }); }} aria-label="Handicap index" /></td>
                <td><select value={p.tee} onChange={(x) => update(p, { tee: x.target.value })} aria-label="Tee">{tees.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select></td>
                <td><select value={p.gender} onChange={(x) => update(p, { gender: x.target.value })} aria-label="Gender"><option value="M">M</option><option value="F">F</option></select></td>
                <td><select value={p.cat} onChange={(x) => update(p, { cat: x.target.value })} aria-label="Category"><option value="open">Adult</option><option value="junior">Junior</option><option value="senior">Senior</option></select></td>
                <td><input type="number" min="0" max="200" defaultValue={p.grp} style={{ width: 64 }} onBlur={(x) => { const v = parseInt(x.target.value) || 0; if (v !== p.grp) update(p, { grp: v }); }} aria-label="Group" /></td>
                {bb && <td><select value={p.pair} onChange={(x) => update(p, { pair: x.target.value })} aria-label="Pair"><option value="A">A</option><option value="B">B</option></select></td>}
                <td className="num" title="Course handicap → playing handicap">{ch} → {ph}</td>
                <td>{p.status === 'pending' ? <button type="button" className="btn small" onClick={() => update(p, { status: 'active' })}>Approve</button> : <select value={p.status} onChange={(x) => update(p, { status: x.target.value })} aria-label="Status"><option value="active">Playing</option><option value="withdrawn">Withdrawn</option></select>}</td>
                <td>{p.attested_at ? 'Attested' : p.signed_at ? 'Signed' : '—'}{(p.signed_at || p.attested_at) && <> · <button type="button" className="link" onClick={() => reopen(p)}>Reopen</button></>}</td>
                <td className="r"><ConfirmButton className="link" confirmText="Tap again" onConfirm={() => remove(p)}>Remove</ConfirmButton></td>
              </tr>
            );
          })}</tbody>
        </table></div>
        {!list.length && <div className="empty">No players match.</div>}
      </div>
    </div>
  );
}

/* ---------------- links & QR ---------------- */
function QrBox({ url, title, line, ev, club }) {
  const [img, setImg] = useState('');
  useEffect(() => { qrDataUrl(url, 400).then(setImg); }, [url]);
  return (
    <div className="qrbox">
      {img && <img src={img} alt={`QR code for ${title}`} />}
      <div className="stack">
        <b>{title}</b><p className="note">{line}</p>
        <CopyField value={url} />
        <div className="btns"><a className="btn ghost small" href={url} target="_blank" rel="noreferrer">Open</a><button type="button" className="btn ghost small" onClick={() => posterPdf({ event: ev, club, url, title, line })}>Download A4 poster</button></div>
      </div>
    </div>
  );
}

function LinksTab({ d, E, ev, toast, priv, loadPriv, markSent }) {
  const [grp, setGrp] = useState('all'); const [busy, setBusy] = useState('');
  const groups = [...new Set(d.players.map((p) => p.grp))].sort((a, b) => a - b);
  const people = d.players.filter((p) => p.status !== 'withdrawn' && (grp === 'all' || String(p.grp) === grp)).sort((a, b) => (a.grp || 999) - (b.grp || 999) || a.name.localeCompare(b.name));
  const items = people.filter((p) => priv[p.id]).map((p) => ({ ...p, ...priv[p.id], url: playerUrl(priv[p.id].token), sub: p.grp ? `Group ${p.grp}` : '' }));
  const msg = (p) => `Hi ${p.name.split(' ')[0]}, here is your personal scorecard for ${ev.name}: ${playerUrl(priv[p.id]?.token)}  Open it on your phone on the day to enter your scores. Please don't share it.`;
  const reset = async (p) => {
    const token = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 32);
    const { error } = await supabase.from('player_private').update({ token }).eq('player_id', p.id);
    if (!error) await supabase.from('player_sessions').delete().eq('player_id', p.id);
    if (error) toast(errText(error)); else { toast(`New link made for ${p.name}. The old link no longer works.`); loadPriv(); }
  };
  return (
    <div className="stack">
      <div className="card form" data-tour="eventlinks">
        <h2>Event links</h2>
        <QrBox url={`${origin()}/e/${ev.slug}`} title="Live leaderboard" line="For spectators and the clubhouse. Anyone with this link can follow scores." ev={ev} club={d.club} />
        <QrBox url={`${origin()}/e/${ev.slug}/tv`} title="Clubhouse TV display" line="Open on the clubhouse TV's browser or a laptop connected to it." ev={ev} club={d.club} />
        {ev.self_register ? <QrBox url={`${origin()}/e/${ev.slug}/join`} title="Player registration" line="Players not on the list scan this to register themselves." ev={ev} club={d.club} />
          : <p className="note">Self-registration is off. Turn it on under Setup to get a registration QR code.</p>}
      </div>
      <div className="card">
        <div className="pad stack">
          <h2>Personal player links</h2>
          <Tip id="links-how">Each link is private to one player: whoever opens it can score as that player. Send it straight to the player, not to a group chat. If one goes astray, use <b>New link</b> and the old one stops working.</Tip>
          <p className="note">Each player gets their own private link. Opening it on their phone signs them in as that player, for this event only. Send by WhatsApp or email, or print the QR sheet and hand each player their code at registration.</p>
          <div className="row">
            <select className="pick" style={{ width: 180 }} value={grp} onChange={(e) => setGrp(e.target.value)} aria-label="Group"><option value="all">All groups</option>{groups.map((g) => <option key={g} value={String(g)}>{g ? 'Group ' + g : 'Not in a group'}</option>)}</select>
            <button type="button" data-tour="qrsheet" className="btn" disabled={!items.length || !!busy} onClick={async () => { setBusy('qr'); markSent(); try { await playerQrSheet({ event: ev, items }); } catch { toast("Couldn't build the PDF"); } setBusy(''); }}>{busy === 'qr' ? 'Preparing…' : `Download QR sheet (${items.length})`}</button>
            <button type="button" className="btn ghost" disabled={!items.length} onClick={() => { markSent(); saveBlob(linksCsv(items), slugify(ev.name) + '-player-links.csv'); }}>Download links (CSV)</button>
          </div>
          <p className="note">The CSV has every player's name, mobile, email and link, ready for a mail merge or bulk WhatsApp tool.</p>
        </div>
        <div className="tscroll" data-tour="sendlinks"><table className="list">
          <thead><tr><th>Player</th><th>Group</th><th>Link</th><th>Send</th><th /></tr></thead>
          <tbody>{people.map((p) => {
            const pr = priv[p.id]; if (!pr) return null; const url = playerUrl(pr.token); const n = waNumber(pr.phone);
            return (
              <tr key={p.id}>
                <td>{p.name}</td><td>{p.grp || '—'}</td>
                <td style={{ minWidth: 260 }}><CopyField value={url} /></td>
                <td className="row" style={{ flexWrap: 'nowrap' }}>
                  <a className="btn ghost small" href={`https://wa.me/${n}?text=${encodeURIComponent(msg(p))}`} target="_blank" rel="noreferrer" onClick={markSent}>WhatsApp</a>
                  {pr.email && <a className="btn ghost small" onClick={markSent} href={`mailto:${pr.email}?subject=${encodeURIComponent('Your scorecard: ' + ev.name)}&body=${encodeURIComponent(msg(p))}`}>Email</a>}
                </td>
                <td className="r"><ConfirmButton className="link" confirmText="Tap again: old link stops working" onConfirm={() => reset(p)}>New link</ConfirmButton></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </div>
    </div>
  );
}

/* ---------------- committee ---------------- */
function CommitteeTab({ d, E, ev, toast }) {
  const [log, setLog] = useState([]);
  const [ovr, setOvr] = useState({ who: '', hole: 1, val: '' });
  const loadLog = async () => { const { data } = await supabase.from('score_log').select('*').eq('event_id', ev.id).order('at', { ascending: false }).limit(60); setLog(data || []); };
  useEffect(() => { loadLog(); }, [d.scores.length, d.teamScores.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const issues = E.issues();
  const name = (id) => d.players.find((p) => p.id === id)?.name || '—';
  const setOfficial = async (pid, hole, v) => { const { error } = await supabase.rpc('admin_set_score', { p_player: pid, p_hole: hole, p_strokes: v }); if (error) toast(errText(error)); else toast(v == null ? 'Committee score removed' : `Hole ${hole} set to ${v === 0 ? 'P' : v}`); };
  const setTeam = async (key, hole, v) => { const { error } = await supabase.rpc('admin_set_team_score', { p_event: ev.id, p_team: key, p_hole: hole, p_field: 'strokes', p_strokes: v, p_drive: null }); if (error) toast(errText(error)); else toast(`Team ${key}, hole ${hole} set`); };
  const started = E.active.filter((p) => E.indCalc(p).thru > 0).length;
  const finished = E.active.filter((p) => E.indCalc(p).thru === 18).length;
  const attested = E.active.filter((p) => p.attested_at).length;
  const disputes = issues.filter((x) => x.kind === 'dispute');
  const teams = E.fmt === 'scramble' ? E.teamsOf() : [];
  const sv = (v) => (v === 0 ? 'P' : v);

  return (
    <div className="stack">
      <div className="grid2" data-tour="stats">
        {[['Players', E.active.length], ['Started', started], ['Finished 18', finished], ['Signed & attested', attested], ['Disputed holes', disputes.length]].map(([l, v]) => (
          <div key={l} className="card pad"><div className="note">{l}</div><div style={{ fontFamily: 'var(--display)', fontSize: '2rem', fontWeight: 700 }} className={l === 'Disputed holes' && v ? 'under' : ''}>{v}</div></div>
        ))}
      </div>

      <div className="card">
        <div className="pad stack" data-tour="attention"><h2>Needs attention</h2><Tip id="committee-how">When a player and their marker enter different scores for a hole, it appears here. Pick the right one, or set an official score below. The leaderboard updates straight away.</Tip></div>
        {!issues.length ? <div className="empty">Nothing to check right now.</div> : (
          <div className="tscroll"><table className="list"><tbody>
            {issues.map((x, i) => (
              <tr key={i} className={x.kind === 'dispute' ? 'bad' : ''}>
                <td><b>{x.p.name}</b>{x.p.group ? <span className="note"> · Grp {x.p.group}</span> : null}</td>
                <td>{x.kind === 'dispute' ? `Hole ${x.h}: player says ${sv(x.self)}, marker says ${sv(x.marker)}` : (x.h ? `Hole ${x.h}: ` : '') + x.msg}</td>
                <td className="r">{x.kind === 'dispute' && <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="btn small" onClick={() => setOfficial(x.p.id, x.h, x.self)}>Use {sv(x.self)}</button>
                  <button type="button" className="btn small ghost" onClick={() => setOfficial(x.p.id, x.h, x.marker)}>Use {sv(x.marker)}</button>
                </div>}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </div>

      <div className="card form" data-tour="official">
        <h2>Set an official score</h2>
        <p className="note">A committee score overrides both the player's and the marker's entry. Leave the score empty to remove the committee score.</p>
        <div className="grid2">
          <label className="f">{teams.length ? 'Team' : 'Player'}<select value={ovr.who} onChange={(e) => setOvr({ ...ovr, who: e.target.value })}><option value="">Choose…</option>
            {teams.length ? teams.map((t) => <option key={t.key} value={'t:' + t.key}>Group {t.group}: {t.label}</option>) : E.active.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={'p:' + p.id}>{p.name}</option>)}
          </select></label>
          <label className="f">Hole<select value={ovr.hole} onChange={(e) => setOvr({ ...ovr, hole: +e.target.value })}>{Array.from({ length: 18 }, (_, k) => <option key={k} value={k + 1}>{k + 1} (par {E.PAR[k]})</option>)}</select></label>
          <label className="f">Score (0 = picked up)<input type="number" min="0" max="20" value={ovr.val} onChange={(e) => setOvr({ ...ovr, val: e.target.value })} /></label>
        </div>
        {ovr.who.startsWith('p:') && (() => { const p = E.players.find((x) => x.id === ovr.who.slice(2)); const s = p && E.holeState(p, ovr.hole); return s ? <p className="note">Now: player {s.self == null ? '—' : sv(s.self)} · marker {s.marker == null ? '—' : sv(s.marker)} · committee {s.admin == null ? '—' : sv(s.admin)}</p> : null; })()}
        <div><button type="button" className="btn" disabled={!ovr.who} onClick={() => { const v = ovr.val === '' ? null : Math.max(0, Math.min(20, parseInt(ovr.val))); if (ovr.who.startsWith('t:')) setTeam(ovr.who.slice(2), ovr.hole, v); else setOfficial(ovr.who.slice(2), ovr.hole, v); }}>Save official score</button></div>
      </div>

      <div className="card">
        <div className="pad" data-tour="log"><h2>Recent changes</h2></div>
        {!log.length ? <div className="empty">No score changes yet.</div> : (
          <div className="tscroll"><table className="list"><thead><tr><th>Time</th><th>Player / team</th><th>Hole</th><th>Entry</th><th>Change</th><th>By</th></tr></thead><tbody>
            {log.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</td>
                <td>{l.player_id ? name(l.player_id) : 'Team ' + l.team_key}</td><td>{l.hole}</td>
                <td>{{ self: 'Player', marker: 'Marker', admin: 'Committee', team: 'Team' }[l.role] || l.role}{l.field === 'drive' ? ' (drive)' : ''}</td>
                <td>{l.field === 'drive' ? `${l.old_value ? name(l.old_value) : '—'} → ${l.new_value ? name(l.new_value) : '—'}` : `${l.old_value ?? '—'} → ${l.new_value ?? 'cleared'}`}</td>
                <td>{l.by_player ? name(l.by_player) : 'Admin'}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </div>
    </div>
  );
}
