import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { errText, isRealUser, supabase } from '../lib/supabase.js';
import { money } from '../lib/brand.js';
import { ConfirmButton, Header, Loading, fmtDate, statusLabel, useHashTab, useSession, useToast } from '../components/ui.jsx';

// The platform owner's view of the whole business. Only works for accounts in platform_admins.
export default function Platform() {
  const session = useSession(); const toast = useToast();
  const [tab, go] = useHashTab(['overview', 'events', 'orgs', 'courses', 'settings'], 'overview');
  const [ok, setOk] = useState(null);
  const [data, setData] = useState(null);

  const load = async () => {
    const [st, clubs, events, pays, courses] = await Promise.all([
      supabase.from('app_settings').select('*').eq('id', 1).single(),
      supabase.from('clubs').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('events').select('id,name,event_date,days,paid_days,status,club_id,created_at,slug').order('event_date', { ascending: false }).limit(1000),
      supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('courses').select('id,name,location,shared,verified,club_id,created_at').eq('shared', true).order('name'),
    ]);
    setData({ settings: st.data, clubs: clubs.data || [], events: events.data || [], payments: pays.data || [], courses: courses.data || [] });
  };
  useEffect(() => {
    if (!isRealUser(session)) return;
    supabase.rpc('is_platform_admin').then(({ data: yes }) => { setOk(!!yes); if (yes) load(); });
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined) return <Loading />;
  if (!isRealUser(session)) return <Navigate to="/login?next=/platform" replace />;
  if (ok === false) return <main><div className="wrap"><div className="card"><div className="empty"><b>Owner access only</b>This page is for the platform owner. <Link to="/admin">Go to your events</Link></div></div></div></main>;
  if (!data) return <Loading />;

  const org = (id) => data.clubs.find((c) => c.id === id);
  const paid = data.payments.filter((p) => p.status === 'paid');
  const byCur = {}; paid.forEach((p) => { byCur[p.currency] = (byCur[p.currency] || 0) + p.amount_cents; });
  const month = new Date().toISOString().slice(0, 7);
  const byCurMonth = {}; paid.filter((p) => (p.paid_at || '').startsWith(month)).forEach((p) => { byCurMonth[p.currency] = (byCurMonth[p.currency] || 0) + p.amount_cents; });
  const fmtSum = (o) => Object.entries(o).map(([c, v]) => money(v, c)).join(' + ') || money(0, data.settings?.currency || 'usd');
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = data.events.filter((e) => e.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date));

  const comp = async (e) => { const { error } = await supabase.from('events').update({ paid_days: e.days }).eq('id', e.id); if (error) toast(errText(error)); else { toast(`${e.name} is now free`); load(); } };
  const setPlan = async (c, plan) => { const { error } = await supabase.from('clubs').update({ plan }).eq('id', c.id); if (error) toast(errText(error)); else { toast(plan === 'comp' ? `${c.name} no longer pays` : `${c.name} pays per event again`); load(); } };
  const verify = async (c, v) => { const { error } = await supabase.from('courses').update({ verified: v }).eq('id', c.id); if (error) toast(errText(error)); else load(); };

  return (
    <>
      <Header title="Owner dashboard" sub="Every organisation, event and payment" logo="/icons/icon-192.png" right={<span className="hdrlinks"><Link to="/admin">My events</Link></span>}
        tabs={[['overview', 'Overview'], ['events', `Events (${data.events.length})`], ['orgs', `Organisations (${data.clubs.length})`], ['courses', 'Course library'], ['settings', 'Price & settings']]} current={tab} onTab={go} />
      <main><div className="wrap wide">
        {tab === 'overview' && (
          <>
            <div className="grid2">
              {[['Revenue, all time', fmtSum(byCur)], ['Revenue this month', fmtSum(byCurMonth)], ['Paid event days', paid.reduce((a, p) => a + p.days, 0)], ['Organisations', data.clubs.length], ['Upcoming events', upcoming.length], ['Live now', data.events.filter((e) => e.status === 'live').length]].map(([l, v]) => (
                <div key={l} className="card pad"><div className="note">{l}</div><div style={{ fontFamily: 'var(--display)', fontSize: '2rem', fontWeight: 700 }}>{v}</div></div>
              ))}
            </div>
            {data.settings?.free_mode && <div className="banner warn">Free mode is on: nobody is asked to pay. Turn it off under Price &amp; settings.</div>}
            <div className="card"><div className="pad"><h2>Recent payments</h2></div>
              {!data.payments.length ? <div className="empty">No payments yet.</div> : (
                <div className="tscroll"><table className="list"><thead><tr><th>Date</th><th>Event</th><th>Organisation</th><th>Days</th><th className="r">Amount</th><th>Status</th><th>Country</th><th /></tr></thead><tbody>
                  {data.payments.slice(0, 50).map((p) => { const ev = data.events.find((e) => e.id === p.event_id); return (
                    <tr key={p.id}><td>{new Date(p.paid_at || p.created_at).toLocaleDateString('en-ZA')}</td><td>{ev?.name || '—'}</td><td>{org(p.club_id)?.name || '—'}</td><td>{p.days}</td><td className="r">{money(p.amount_cents, p.currency)}</td>
                      <td>{{ paid: 'Paid', pending: 'Not completed', failed: 'Failed', refunded: 'Refunded' }[p.status]}</td><td>{p.country || ''}</td><td>{p.receipt_url && <a href={p.receipt_url} target="_blank" rel="noreferrer">Receipt</a>}</td></tr>
                  ); })}
                </tbody></table></div>
              )}
            </div>
          </>
        )}

        {tab === 'events' && (
          <div className="card"><div className="tscroll"><table className="list"><thead><tr><th>Date</th><th>Event</th><th>Organisation</th><th>Status</th><th>Paid</th><th /></tr></thead><tbody>
            {data.events.map((e) => { const o = org(e.club_id); const free = o?.plan === 'comp'; return (
              <tr key={e.id}><td>{fmtDate(e.event_date)}{e.days > 1 ? ` (+${e.days - 1})` : ''}</td><td><a href={`/e/${e.slug}`} target="_blank" rel="noreferrer">{e.name}</a></td><td>{o?.name}</td><td><span className={'pill st-' + e.status}>{statusLabel[e.status]}</span></td>
                <td>{free ? 'Free organisation' : `${e.paid_days} of ${e.days} day${e.days > 1 ? 's' : ''}`}</td>
                <td className="r">{!free && e.paid_days < e.days && <ConfirmButton className="link" confirmText="Tap again to make it free" onConfirm={() => comp(e)}>Make free</ConfirmButton>}</td></tr>
            ); })}
          </tbody></table></div></div>
        )}

        {tab === 'orgs' && (
          <div className="card"><div className="tscroll"><table className="list"><thead><tr><th>Organisation</th><th>Type</th><th>Country</th><th>Events</th><th>Joined</th><th>Plan</th></tr></thead><tbody>
            {data.clubs.map((c) => (
              <tr key={c.id}><td>{c.name}</td><td>{c.kind}</td><td>{c.country || ''}</td><td>{data.events.filter((e) => e.club_id === c.id).length}</td><td>{new Date(c.created_at).toLocaleDateString('en-ZA')}</td>
                <td><select value={c.plan} onChange={(e) => setPlan(c, e.target.value)} aria-label={`Plan for ${c.name}`}><option value="pay">Pays per event</option><option value="comp">Free (complimentary)</option></select></td></tr>
            ))}
          </tbody></table></div></div>
        )}

        {tab === 'courses' && (
          <div className="card"><div className="pad"><p className="note">Courses organisers have shared. Mark a course as checked once you've confirmed its card; organisers see a "Checked" badge.</p></div>
            <div className="tscroll"><table className="list"><thead><tr><th>Course</th><th>Location</th><th>Added by</th><th>Checked</th></tr></thead><tbody>
              {data.courses.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.location || ''}</td><td>{org(c.club_id)?.name || ''}</td><td><label className="chk"><input type="checkbox" checked={c.verified} onChange={(e) => verify(c, e.target.checked)} />{c.verified ? 'Checked' : 'Not yet'}</label></td></tr>)}
            </tbody></table></div>
          </div>
        )}

        {tab === 'settings' && <SettingsTab settings={data.settings} reload={load} toast={toast} />}
      </div></main>
    </>
  );
}

function SettingsTab({ settings, reload, toast }) {
  const [f, setF] = useState({ price: (settings.price_cents / 100).toFixed(2), zar: (settings.price_zar_cents / 100).toFixed(2), free: settings.free_mode });
  const save = async () => {
    const price = Math.round(parseFloat(f.price) * 100), zar = Math.round(parseFloat(f.zar) * 100);
    if (!(price > 0) || !(zar > 0)) { toast('Enter prices above zero'); return; }
    const { error } = await supabase.from('app_settings').update({ price_cents: price, price_zar_cents: zar, free_mode: f.free, updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) toast(errText(error)); else { toast('Saved. New checkouts use these prices.'); reload(); }
  };
  return (
    <div className="card form" style={{ maxWidth: 560 }}>
      <h2>Price &amp; settings</h2>
      <div className="grid2">
        <label className="f">Price per event day ({settings.currency.toUpperCase()}, card checkout)<input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
        <label className="f">Price per event day (ZAR, for Paystack)<input inputMode="decimal" value={f.zar} onChange={(e) => setF({ ...f, zar: e.target.value })} /></label>
      </div>
      <label className="chk"><input type="checkbox" checked={f.free} onChange={(e) => setF({ ...f, free: e.target.checked })} /> Free mode: nobody pays (for a launch offer or testing)</label>
      <p className="note">Country routing: {Object.entries(settings.routes || {}).map(([k, v]) => `${k === 'default' ? 'everyone else' : k} → ${v}`).join(' · ')}. A gateway is only offered once its keys are added in Netlify.</p>
      <div><button type="button" className="btn" onClick={save}>Save</button></div>
    </div>
  );
}
