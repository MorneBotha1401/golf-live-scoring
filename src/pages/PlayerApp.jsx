import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useEventData } from '../lib/useEvent.js';
import { makeEngine, strokesOn, TERMS, countWord, fmtPar, first, fmtHi } from '../lib/engine.js';
import { indCard, teamCard } from '../lib/render.js';
import { ensureSession, errText, supabase } from '../lib/supabase.js';
import { isStandalone, platform, setPlayerManifest, shouldOfferInstall } from '../lib/install.js';
import InstallSheet from '../components/InstallSheet.jsx';
import { ConfirmButton, Header, LiveBadge, Loading, Sponsors, useHashTab, useSession, useToast } from '../components/ui.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import Scorecards from '../components/Scorecards.jsx';
import { Coach, Help, Tour, Welcome, seenTour, useOnboarding } from '../components/Guide.jsx';
import { playerHelp } from '../lib/helpContent.js';

const FORMAT_SHORT = { stableford: 'Stableford', betterball: 'Betterball Stableford', alliance: '4-ball Alliance', scramble: 'American Scramble', scramble_drive: 'Scramble, own ball' };
const get = (o, path) => path.reduce((a, k) => (a == null ? undefined : a[k]), o);
function setIn(o, [a, b, c], v) { return { ...o, [a]: { ...(o[a] || {}), [b]: { ...(o[a]?.[b] || {}), [c]: v } } }; }
function delIn(o, [a, b, c]) { const n = { ...o, [a]: { ...(o[a] || {}), [b]: { ...(o[a]?.[b] || {}) } } }; delete n[a][b][c]; return n; }

const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

/**
 * The personal code can ride along in the address (?k=…). A home-screen icon opens
 * that address in fresh storage on iPhones, so link this device to the player first.
 */
export default function PlayerApp() {
  const { slug } = useParams();
  const k = new URLSearchParams(window.location.search).get('k');
  const [ready, setReady] = useState(() => !k || ls.get('claimed:' + k) === '1');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (ready) return undefined;
    let on = true;
    (async () => {
      try {
        await ensureSession();
        const { data, error } = await supabase.rpc('claim_player', { p_token: k });
        if (error) throw error;
        ls.set('player:' + data.slug, data.player_id); ls.set('token:' + data.slug, k); ls.set('claimed:' + k, '1');
        if (on) setReady(true);
      } catch (e) { if (on) setErr(errText(e)); }
    })();
    return () => { on = false; };
  }, [ready, k]);
  if (!ready) {
    return <main><div className="wrap"><div className="card"><div className="empty">
      {err ? <><b>We couldn't open your scorecard</b>{err}</> : <><b>Opening your scorecard…</b>One moment.</>}
    </div></div></div></main>;
  }
  return <PlayerAppInner key={slug} />;
}

function PlayerAppInner() {
  const { slug } = useParams();
  const toast = useToast();
  const session = useSession();
  const [tab, go] = useHashTab(['score', 'board', 'cards'], 'score');
  const [meId, setMeId] = useState(() => { try { return localStorage.getItem('player:' + slug); } catch { return null; } });
  const [scope, setScope] = useState(null);
  const d = useEventData({ slug }, { scope: tab === 'score' ? scope : null });
  const [ov, setOv] = useState({});
  const inflight = useRef({}); const timers = useRef({}); const ovRef = useRef(ov); ovRef.current = ov;
  const [hole, setHoleRaw] = useState(() => +(localStorage.getItem('hole:' + slug) || 1) || 1);
  const setHole = (h) => { setHoleRaw(h); try { localStorage.setItem('hole:' + slug, String(h)); } catch { /* ignore */ } };
  const [cardOpen, setCardOpen] = useState(false);

  // Which player is this phone? (sessions are bound when the personal link is opened)
  useEffect(() => {
    if (!session || !d.players.length) return;
    (async () => {
      const { data } = await supabase.from('player_sessions').select('player_id').eq('user_id', session.user.id);
      const ids = new Set((data || []).map((x) => x.player_id));
      const mine = d.players.find((p) => ids.has(p.id));
      if (mine && mine.id !== meId) { setMeId(mine.id); try { localStorage.setItem('player:' + slug, mine.id); } catch { /* ignore */ } }
      if (!mine && meId && !d.players.some((p) => p.id === meId)) setMeId(null);
    })();
  }, [session, d.players.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const E = useMemo(() => (d.event ? makeEngine({ ...d, overlay: ov }) : null), [d.event, d.course, d.players, d.scores, d.teamScores, ov]); // eslint-disable-line react-hooks/exhaustive-deps
  const me = E?.players.find((p) => p.id === meId);
  const group = useMemo(() => {
    if (!E || !me) return [];
    if (!me.group) return [me];
    return E.active.filter((p) => p.group === me.group).sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.name.localeCompare(b.name)));
  }, [E, me]);
  const groupKey = group.map((p) => p.id).join(',');
  useEffect(() => { setScope(group.length ? group.map((p) => p.id) : null); }, [groupKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drop local values once the server has the same value.
  useEffect(() => {
    if (!E) return;
    setOv((o) => {
      let n = o, changed = false;
      for (const k of Object.keys(o)) for (const f of Object.keys(o[k])) for (const hk of Object.keys(o[k][f])) {
        const ik = `${k}|${f}|${hk}`; if (inflight.current[ik] || timers.current[ik]) continue;
        const h = +hk.slice(1); const v = o[k][f][hk]; let server;
        if (k.startsWith('p:')) { const row = d.scores.find((s) => s.player_id === k.slice(2) && s.hole === h && s.role === f); server = row ? row.strokes : null; }
        else { const row = d.teamScores.find((s) => s.team_key === k.slice(2) && s.hole === h); server = f === 'drive' ? row?.drive_player || null : row?.strokes ?? null; }
        if (server === v) { n = delIn(n, [k, f, hk]); changed = true; }
      }
      return changed ? n : o;
    });
  }, [d.scores, d.teamScores]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback((path, v) => {
    const ik = path.join('|');
    setOv((o) => setIn(o, path, v));
    clearTimeout(timers.current[ik]);
    timers.current[ik] = setTimeout(async () => {
      delete timers.current[ik];
      const [k, f, hk] = path; const h = +hk.slice(1); const val = get(ovRef.current, path);
      inflight.current[ik] = true;
      try {
        let res;
        if (k.startsWith('p:')) res = await supabase.rpc('submit_score', { p_player: k.slice(2), p_hole: h, p_strokes: val });
        else res = await supabase.rpc('submit_team_score', { p_event: d.event.id, p_team: k.slice(2), p_hole: h, p_field: f === 'drive' ? 'drive' : 'strokes', p_strokes: f === 'drive' ? null : val, p_drive: f === 'drive' ? val : null });
        if (res.error) throw res.error;
      } catch (e) {
        toast(errText(e)); setOv((o) => delIn(o, path));
      } finally { delete inflight.current[ik]; }
    }, 450);
  }, [d.event?.id, toast]);

  const ob = useOnboarding('player', !!me && tab === 'score');

  // Home screen: point the app at this player's card, keep the code in the address, offer to save it.
  const token = new URLSearchParams(window.location.search).get('k') || ls.get('token:' + slug);
  const playerUrl = `/play/${slug}${token ? '?k=' + encodeURIComponent(token) : ''}`;
  const evName = d.event?.name || '';
  const shortName = evName.length <= 12 ? evName || 'My scorecard' : (evName.split(/\s+/).reduce((a, w) => ((a + ' ' + w).trim().length <= 12 ? (a + ' ' + w).trim() : a), '') || evName.slice(0, 12));
  useEffect(() => {
    if (!me) return;
    if (token && !window.location.search.includes('k=')) { try { window.history.replaceState(null, '', playerUrl + window.location.hash); } catch { /* ignore */ } }
    setPlayerManifest({ url: playerUrl, name: `${evName} · ${me.name.split(' ')[0]}'s scorecard`, shortName });
  }, [me?.id, evName, token]); // eslint-disable-line react-hooks/exhaustive-deps
  const [a2, setA2] = useState(false);
  const offered = useRef(false);
  useEffect(() => {
    if (!me || offered.current || ob.welcome || ob.tour || !seenTour('player') || platform().os === 'desktop' || !shouldOfferInstall()) return undefined;
    const t = setTimeout(() => { offered.current = true; setA2(true); }, 2500);
    return () => clearTimeout(t);
  }, [me?.id, ob.welcome, ob.tour]); // eslint-disable-line react-hooks/exhaustive-deps

  if (d.loading || session === undefined) return <Loading />;
  if (!d.event) return <main><div className="wrap"><div className="card"><div className="empty"><b>Event not found</b>Open the personal link the organiser sent you.</div></div></div></main>;
  const ev = d.event;
  const header = (
    <Header title={ev.name} sub={me ? `${me.name}${me.group ? ' · Group ' + me.group : ''}` : d.club?.name} logo={ev.logo_url || d.club?.logo_url}
      status={<LiveBadge event={ev} />} right={E ? <Help topics={playerHelp(E)} title="Help with your scorecard" intro={me ? 'Quick answers. Tap a question to open it.' : 'Open the personal link the organiser sent you to get your own scorecard.'} onTour={me ? () => { go('score'); ob.startTour(); } : undefined} /> : null}
      tabs={[['score', 'My scores'], ['board', 'Leaderboard'], ['cards', 'Scorecards']]} current={tab} onTab={go} />
  );
  if (!me) {
    return <>{header}<main><div className="wrap">
      {tab === 'score' ? <div className="card"><div className="empty"><b>This phone isn't linked to a player yet</b>Open the personal link or QR code the organiser sent you. You can still follow the leaderboard.</div></div>
        : tab === 'board' ? <Leaderboard E={E} event={ev} club={d.club} tvHref={`/e/${slug}/tv`} /> : <Scorecards E={E} />}
    </div></main></>;
  }

  const banner = me.status === 'pending' ? <div className="banner warn">You're registered. The organiser still has to approve your entry before you can score.</div>
    : ev.status === 'draft' ? <div className="banner warn"><b>Scoring isn't open yet.</b> The organiser opens it under Setup → Open scoring (go live). Until then you can check your details below.</div>
    : ev.status !== 'live' ? <div className="banner">Scoring is closed. These are the final results.</div> : null;
  const canScore = ev.status === 'live' && me.status === 'active';
  const blockMsg = ev.status === 'draft' ? "Scoring hasn't opened yet. The organiser opens it under Setup → Open scoring (go live)."
    : ev.status !== 'live' ? 'Scoring is closed for this event.' : me.status !== 'active' ? 'Your entry still needs the organiser’s approval.' : null;

  const scr = E.fmt === 'scramble';
  const others = group.length > 1;
  const myTeam = E.isTeam && me.group ? E.teamsOf().find((t) => t.key === E.teamKey(me)) : null;
  const steps = [
    { target: '[data-tour="hole"]', title: 'Choose the hole', body: <p>Use the arrows to move between holes. You'll see the par, stroke index and distance for each tee{E.allianceLike ? ', plus how many scores count on that hole' : ''}.</p> },
    { target: '[data-tour="strip"]', title: 'Jump to any hole', body: <p>Tap a number to jump straight there. Shaded holes are complete. A <b className="under">red dot</b> means a score needs checking.</p> },
    scr
      ? { target: '[data-tour="stepper"]', title: 'Enter the team score', body: <><p>Your team shares one score per hole. The first tap on <b>+</b> fills in par; then use <b>+</b> and <b>−</b>. Anyone in the team can enter it.</p>{E.tracksDrives && <p>Underneath, tap whose drive you used. The numbers show each player's drives against the minimum.</p>}</> }
      : { target: '[data-tour="stepper"]', title: 'Enter your score', body: <><p>Enter your <b>gross</b> score. The first tap on <b>+</b> fills in par; then use <b>+</b> and <b>−</b>. Your net score{E.fmt === 'stroke' ? '' : ' and Stableford points'} work out automatically.</p>{E.pickupOK && <p>Didn't finish the hole? Tap <b>Picked up</b>.</p>}<p>Scores save as you tap. No save button needed.</p></> },
    ...(!scr && others ? [{ target: '[data-tour="marking"]', title: "You're also the marker", body: <><p>Enter the scores of the others in your group too. Your entry is the marker's check on theirs.</p><p>When the player's and the marker's scores match you'll see <b className="okc">✓ Agreed</b>. If they don't, both phones show it so you can sort it out on the spot.</p></> }] : []),
    ...(!scr ? [{ target: '[data-tour="finish"]', title: 'Sign your card', body: <p>After 18 holes, with nothing disputed, tap <b>Sign my card</b>. Your marker then attests it on their phone. That locks the card, just like handing it in.</p> }] : []),
    { target: '[data-tour="tabs"]', title: 'Follow the leaderboard', body: <><p><b>Leaderboard</b> shows the live standings. Tap any name to see their card. <b>Scorecards</b> shows every {E.isTeam ? 'team' : 'player'}'s card.</p><p>Tap <b>?</b> at the top any time to see this again.</p></> },
  ];

  return (
    <>
      {header}
      <Welcome open={ob.welcome} title={`Welcome, ${first(me.name)}`} onTour={ob.startTour} onSkip={ob.skip}
        intro={<p>This is your personal scorecard for <b>{ev.name}</b>. It only works for you, so keep the link to yourself.</p>}
        facts={[
          ['Format', E.fmt === 'stroke' ? (E.basis === 'gross' ? 'Medal, gross' : 'Medal, net') : FORMAT_SHORT[E.fmt]],
          scr ? ['Team handicap', myTeam ? String(E.scrambleCalc(myTeam).th) : 'After groups are set'] : ['Your playing HC', String(E.handicaps(me).ph)],
          ['Tee', E.teeOf(me).label || '–'],
          ['Your group', me.group ? (others ? group.filter((p) => p.id !== me.id).map((p) => first(p.name)).join(', ') : `Group ${me.group}`) : 'Not set yet'],
        ]}
        steps={scr ? [
          { title: 'After each hole, enter the team score', text: 'Tap + once for par, then adjust. Anyone in the team can enter it.' },
          ...(E.tracksDrives ? [{ title: 'Tap whose drive you used', text: `Each player needs ${E.r.minDrives || 0} or more.` }] : []),
          { title: 'Follow the leaderboard', text: 'It updates live as every team scores.' },
        ] : [
          { title: 'After each hole, enter your gross score', text: 'Tap + once for par, then adjust. Net and points work out by themselves.' },
          ...(others ? [{ title: 'Enter your group\'s scores too', text: 'You mark the others. Matching scores get a ✓.' }] : []),
          { title: 'Sign your card after 18 holes', text: others ? 'Your marker then attests it, and it locks.' : 'That locks it, like handing it in.' },
        ]} />
      <Tour steps={steps} open={ob.tour} onClose={ob.closeTour} />
      <InstallSheet open={a2} onClose={() => setA2(false)} label={shortName} url={window.location.origin + playerUrl} />
      <main><div className="wrap">
        {banner}
        {tab === 'board' && <Leaderboard E={E} event={ev} club={d.club} tvHref={`/e/${slug}/tv`} highlight={me.id} />}
        {tab === 'cards' && <Scorecards E={E} initial={E.isTeam ? (me.group ? 't:' + E.teamKey(me) : 'all') : 'p:' + me.id} />}
        {tab === 'score' && <ScoreEntry {...{ E, me, group, hole, setHole, save, canScore, blockMsg, cardOpen, setCardOpen, toast, reload: d.reload, paused: ob.welcome || ob.tour || a2, eventId: ev.id, onInstall: () => setA2(true) }} />}
        <Sponsors event={ev} />
      </div></main>
    </>
  );
}

function HoleHeader({ E, hole, setHole, group, team }) {
  const i = hole - 1;
  const done = (h) => (E.fmt === 'scramble' ? team && E.teamScore(team.key, h) != null : group.length && group.every((p) => E.holeState(p, h).v != null));
  const bad = (h) => group.some((p) => E.holeState(p, h).st === 'disputed');
  const lens = Object.values(E.TEES).filter((t, idx, a) => a.findIndex((x) => x.len === t.len) === idx);
  return (
    <div className="card">
      <div className="holehead" data-tour="hole">
        <button type="button" aria-label="Previous hole" onClick={() => setHole(((hole + 16) % 18) + 1)}>‹</button>
        <div className="holeinfo">
          <div className="hn">Hole {hole}</div>
          <div className="hd"><span>Par <b>{E.PAR[i]}</b></span><span>SI <b>{E.SI[i]}</b></span>{lens.map((t) => <span key={t.code}>{t.label.split('·')[0].trim()} <b>{t.y[i]}m</b></span>)}</div>
          {E.allianceLike && <div className="rule">{countWord(E.countFor(i))}</div>}
        </div>
        <button type="button" aria-label="Next hole" onClick={() => setHole((hole % 18) + 1)}>›</button>
      </div>
      <div className="strip" data-tour="strip">
        {Array.from({ length: 18 }, (_, k) => k + 1).map((h) => (
          <button key={h} type="button" aria-label={`Hole ${h}`} className={[h === hole ? 'cur' : done(h) ? 'done' : '', bad(h) ? 'bad' : ''].join(' ')} onClick={() => setHole(h)}>{h}</button>
        ))}
      </div>
    </div>
  );
}

function Stepper({ v, par, label, blocked, onBlocked, onSet }) {
  const term = v == null ? 'Tap +' : v === 0 ? 'Picked up' : TERMS[String(v - par)] || (v - par > 0 ? '+' + (v - par) : '');
  const step = (dlt) => { if (blocked) { onBlocked(blocked); return; } const next = v == null || v === 0 ? (dlt > 0 ? par : par - 1) : Math.min(15, Math.max(1, v + dlt)); if (next !== v) onSet(next); };
  return (
    <div className="stepper">
      <button type="button" aria-label={`One less for ${label}`} aria-disabled={!!blocked} style={blocked ? { opacity: 0.45 } : undefined} onClick={() => step(-1)}>−</button>
      <div className="val"><b className="num">{v == null ? '–' : v === 0 ? 'P' : v}</b><small>{term}</small></div>
      <button type="button" aria-label={`One more for ${label}`} aria-disabled={!!blocked} style={blocked ? { opacity: 0.45 } : undefined} onClick={() => step(1)}>+</button>
    </div>
  );
}

function ScoreEntry({ E, me, group, hole, setHole, save, canScore, blockMsg, cardOpen, setCardOpen, toast, reload, paused, eventId, onInstall }) {
  const i = hole - 1;
  const team = E.isTeam && me.group ? E.teamsOf().find((t) => t.key === E.teamKey(me)) : null;
  const myCalc = E.indCalc(me);
  const entriesFor = (p) => E.entries[p.id]?.[hole] || {};

  const playerRow = (p) => {
    const isMe = p.id === me.id; const role = isMe ? 'self' : 'marker';
    const st = E.holeState(p, hole); const c = E.indCalc(p); const s = strokesOn(E.SI[i], c.ph);
    const mine = isMe ? st.self : st.marker; const theirs = isMe ? st.marker : st.self;
    const locked = isMe ? !!p.signed_at : !!p.attested_at;
    const counted = E.allianceLike && team && E.allianceCalc(team).holes[i].counted.has(p.id);
    const tot = E.fmt === 'stroke' ? (c.thru ? `Total ${E.basis === 'gross' ? 'gross ' + fmtPar(c.toPar) : 'net ' + fmtPar(c.net)}` : 'No score yet') : `Total ${c.pts} pts`;
    return (
      <div key={p.id} className={'pcard' + (isMe ? ' me' : '') + (counted ? ' counted' : '')} data-tour={isMe ? 'me' : p.id === group.find((x) => x.id !== me.id)?.id ? 'marking' : undefined}>
        <div style={{ minWidth: 0 }}>
          <div className="pn">{p.name}<small>{isMe ? 'You' : 'Marking'}</small> {s > 0 && <span className="dots" title="Shots received on this hole">{'•'.repeat(s)}</span>}</div>
          <div className="pi">HI {fmtHi(p.hi)} · course HC {E.handicaps(p).ch} · playing HC {c.ph}</div>
          <div className="res">
            {st.v != null && st.v > 0 && <span>Net <b>{st.v - s}</b></span>}
            {st.v != null && E.fmt !== 'stroke' && <span><b>{E.ptsFor(i, s, st.v)}</b> pts</span>}
            {st.st === 'verified' && <span className="ok">✓ Agreed</span>}
            {st.st === 'official' && <span className="ok">★ Committee</span>}
            {st.st === 'disputed' && <span className="bad">{isMe ? `Marker has ${theirs === 0 ? 'P' : theirs}` : `${first(p.name)} has ${theirs === 0 ? 'P' : theirs}`}</span>}
            {st.st === 'provisional' && mine != null && theirs == null && <span>{isMe ? 'Waiting for marker' : `Waiting for ${first(p.name)}`}</span>}
            {st.st === 'provisional' && mine == null && theirs != null && <span>{isMe ? `Marker entered ${theirs === 0 ? 'P' : theirs}` : `${first(p.name)} entered ${theirs === 0 ? 'P' : theirs}`}</span>}
            <span>{tot} · thru {c.thru}</span>
          </div>
        </div>
        <div data-tour={isMe ? 'stepper' : undefined}><Stepper v={mine ?? null} par={E.PAR[i]} label={p.name} blocked={blockMsg || (locked ? (isMe ? 'Your card is signed, so it is locked. Ask the organiser to reopen it.' : `${p.name}'s card is attested and locked.`) : null)} onBlocked={toast} onSet={(v) => save(['p:' + p.id, role, 'h' + hole], v)} /></div>
        {canScore && !locked && (
          <div className="links">
            {E.pickupOK && mine !== 0 && <button type="button" onClick={() => save(['p:' + p.id, role, 'h' + hole], 0)}>Picked up</button>}
            {mine != null && <button type="button" onClick={() => save(['p:' + p.id, role, 'h' + hole], null)}>Clear hole {hole}</button>}
            {st.st === 'disputed' && <button type="button" onClick={() => save(['p:' + p.id, role, 'h' + hole], theirs)}>Use {theirs === 0 ? 'P' : theirs}</button>}
          </div>
        )}
        {locked && <div className="links"><span className="note">{isMe ? 'Card signed' : 'Card attested'} · locked</span></div>}
      </div>
    );
  };

  const driveRow = (t) => {
    const cur = E.teamDrive(t.key, hole), dc = E.driveCounts(t), min = E.r.minDrives || 0;
    return (
      <div className="drives"><span className="lab">Drive used</span>
        {t.members.map((p) => (
          <button key={p.id} type="button" className="chip" aria-pressed={cur === p.id} disabled={!canScore}
            onClick={() => save(['t:' + t.key, 'drive', 'h' + hole], cur === p.id ? null : p.id)}>{first(p.name)}<small className={dc[p.id] < min ? 'short' : ''}>{dc[p.id]}{min ? '/' + min : ''}</small></button>
        ))}
      </div>
    );
  };

  // finishing
  const selfCount = Object.keys(E.entries[me.id] || {}).filter((h) => E.entries[me.id][h].self != null).length;
  const myDisputes = myCalc.disputes;
  const sign = async () => { const { error } = await supabase.rpc('sign_card', { p_player: me.id }); if (error) toast(errText(error)); else { toast('Card signed. Ask your marker to attest it.'); reload(); } };
  const attest = async (p) => { const { error } = await supabase.rpc('attest_card', { p_player: p.id }); if (error) toast(errText(error)); else { toast(`${p.name}'s card attested`); reload(); } };
  const others = group.filter((p) => p.id !== me.id);
  const disputedHoles = []; for (let h = 1; h <= 18; h++) if (group.some((p) => E.holeState(p, h).st === 'disputed')) disputedHoles.push(h);
  const toAttest = others.filter((p) => p.signed_at && !p.attested_at);
  const scrollTo = (sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const anyEntry = E.fmt === 'scramble' ? (team ? E.scrambleCalc(team).thru > 0 : false) : selfCount > 0;
  const coach = [
    { id: `dispute:${eventId}:${disputedHoles.join(',')}`, show: canScore && disputedHoles.length > 0 && !disputedHoles.includes(hole), title: `Hole ${disputedHoles.join(', ')} needs checking`, text: 'A player and their marker entered different scores. Agree on the right one, then tap "Use" or change your entry.', action: { label: `Go to hole ${disputedHoles[0]}`, onClick: () => setHole(disputedHoles[0]) } },
    { id: 'dispute-here', show: canScore && disputedHoles.includes(hole), title: 'These two scores don\'t match', text: 'Agree on the right score with your group, then tap "Use …" to take the other number or change your own. Until then the hole is flagged for the committee.' },
    { id: `attest:${eventId}:${toAttest.map((p) => p.id).join(',')}`, show: E.fmt !== 'scramble' && toAttest.length > 0, title: `${toAttest.map((p) => first(p.name)).join(' and ')} signed their card`, text: 'As their marker, check their scores, then attest the card at the bottom of this page.', action: { label: 'Show me', onClick: () => scrollTo('[data-tour="finish"]') } },
    { id: `sign:${eventId}`, show: canScore && E.fmt !== 'scramble' && selfCount === 18 && !myDisputes && !me.signed_at, title: 'All 18 holes in', text: 'Check your card, then sign it so your marker can attest it.', action: { label: 'Sign my card', onClick: () => scrollTo('[data-tour="finish"]') } },
    { id: 'first-save', show: canScore && anyEntry, title: 'Saved', text: E.fmt === 'scramble' ? 'Scores save the moment you tap. Your whole team sees them straight away.' : (others.length ? 'Scores save the moment you tap. When your marker enters the same score, the hole gets ✓ Agreed.' : 'Scores save the moment you tap. No save button needed.') },
    { id: 'marker-hint', show: canScore && others.length > 0 && E.fmt !== 'scramble' && selfCount >= 1 && others.every((p) => E.entries[p.id]?.[hole]?.marker == null) && E.entries[me.id]?.[hole]?.self != null, title: 'Now mark your group', text: `Enter ${others.map((p) => first(p.name)).join(', ')}'s score for this hole too. That's the marker's check on their card.` },
  ];

  return (
    <div className="stack">
      <Coach items={coach} paused={paused} />
      <HoleHeader {...{ E, hole, setHole, group, team }} />
      <div className="card">
        {E.fmt === 'scramble' && team ? (() => {
          const c = E.scrambleCalc(team), s = strokesOn(E.SI[i], c.th), v = E.teamScore(team.key, hole);
          const run = E.r.scrScoring === 'stableford' ? `${c.pts} pts` : c.thru ? `net ${fmtPar(c.net)}` : 'no score yet';
          return (
            <div className="tblock">
              <div className="thead"><b>Group {team.group} team</b><span>Team HC {c.th} · thru {c.thru} · {run}</span></div>
              <div className="pcard">
                <div style={{ minWidth: 0 }}>
                  <div className="pn">Team score {s > 0 && <span className="dots">{'•'.repeat(s)}</span>}</div>
                  <div className="pi">{team.label}</div>
                  <div className="res">{v != null && v > 0 && <span>Net <b>{v - s}</b></span>}{v != null && E.r.scrScoring === 'stableford' && <span><b>{E.ptsFor(i, s, v)}</b> pts</span>}</div>
                </div>
                <div data-tour="stepper"><Stepper v={v} par={E.PAR[i]} label="the team" blocked={blockMsg} onBlocked={toast} onSet={(x) => save(['t:' + team.key, 'strokes', 'h' + hole], x)} /></div>
                {canScore && <div className="links">{E.pickupOK && v !== 0 && <button type="button" onClick={() => save(['t:' + team.key, 'strokes', 'h' + hole], 0)}>Picked up</button>}{v != null && <button type="button" onClick={() => save(['t:' + team.key, 'strokes', 'h' + hole], null)}>Clear hole {hole}</button>}</div>}
              </div>
              {E.tracksDrives && driveRow(team)}
            </div>
          );
        })() : (
          <div className="tblock">
            <div className="thead"><b>{me.group ? `Group ${me.group}` : 'Your card'}</b><span>{team && E.allianceLike ? `${E.allianceCalc(team).pts} team pts` : `${E.fmt === 'stroke' ? '' : myCalc.pts + ' pts · '}thru ${myCalc.thru}`}</span></div>
            {group.map(playerRow)}
            {team && E.tracksDrives && driveRow(team)}
          </div>
        )}
      </div>
      {!me.group && <p className="note">You haven't been put in a group yet, so you can only enter your own score. The organiser can assign your group.</p>}
      {others.length > 0 && E.fmt !== 'scramble' && <p className="note">You can enter scores for everyone in your group: your own count as the player's score, the others as the marker's. When a player and their marker agree, the hole is ticked ✓. A red dot on a hole means the two disagree: talk it through and correct one of them.</p>}

      <div className="btns">
        {!isStandalone() && <button type="button" className="btn ghost" onClick={onInstall}><img src="/icons/icon-192.png" alt="" width="20" height="20" style={{ borderRadius: 5 }} />Add to home screen</button>}
        <button type="button" className="btn ghost" onClick={() => setCardOpen(!cardOpen)}>{cardOpen ? 'Hide scorecard' : E.isTeam ? (E.fmt === 'betterball' ? "Show pair's card" : 'Show team card') : 'Show my scorecard'}</button>
      </div>
      {cardOpen && <div className="card" dangerouslySetInnerHTML={{ __html: E.isTeam && team ? teamCard(E, team) : indCard(E, me, myCalc) }} />}

      {E.fmt !== 'scramble' && (
        <div className="card form" data-tour="finish">
          <h3>Finish your round</h3>
          {me.attested_at ? <p className="okc">Your card is signed and attested. Well played.</p>
            : me.signed_at ? <p>You've signed your card. Your marker now has to attest it on their phone.</p>
            : <>
                <p className="note">{selfCount < 18 ? `Enter all 18 holes first (${selfCount} of 18 done).` : myDisputes ? `Sort out ${myDisputes} disputed hole${myDisputes > 1 ? 's' : ''} with your marker first.` : 'All 18 holes entered and agreed. Signing locks your own entries.'}</p>
                <div><ConfirmButton className="btn" disabled={!canScore || selfCount < 18 || myDisputes > 0} confirmText="Tap again to sign" onConfirm={sign}>Sign my card</ConfirmButton></div>
              </>}
          {others.filter((p) => p.signed_at && !p.attested_at).map((p) => (
            <div key={p.id} className="spread"><span>{p.name} has signed. As marker, check their card and attest it.</span><ConfirmButton className="btn small" confirmText="Tap again to attest" onConfirm={() => attest(p)}>Attest {first(p.name)}'s card</ConfirmButton></div>
          ))}
        </div>
      )}
    </div>
  );
}
