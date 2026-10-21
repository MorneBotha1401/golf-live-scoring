import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/* ---------- session ---------- */
export function useSession() {
  const [session, setSession] = useState(undefined); // undefined = loading
  useEffect(() => {
    let on = true;
    supabase.auth.getSession().then(({ data }) => on && setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => { on = false; sub.subscription.unsubscribe(); };
  }, []);
  return session;
}

/* ---------- toast ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null); const t = useRef();
  const show = useCallback((m) => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), 3600); }, []);
  return <ToastCtx.Provider value={show}>{children}{msg && <div className="toast" role="status">{msg}</div>}</ToastCtx.Provider>;
}
export const useToast = () => useContext(ToastCtx);

/* ---------- two-tap confirm (the browser's confirm() is avoided on purpose) ---------- */
export function ConfirmButton({ onConfirm, children, confirmText, className = 'btn danger', disabled }) {
  const [armed, setArmed] = useState(false); const t = useRef();
  useEffect(() => () => clearTimeout(t.current), []);
  return (
    <button type="button" className={className} disabled={disabled} onClick={() => {
      if (!armed) { setArmed(true); clearTimeout(t.current); t.current = setTimeout(() => setArmed(false), 4000); return; }
      setArmed(false); onConfirm();
    }}>{armed ? confirmText || 'Tap again to confirm' : children}</button>
  );
}

export function CopyField({ value, label = 'Copy' }) {
  const toast = useToast(); const ref = useRef();
  return (
    <div className="copyrow">
      <input ref={ref} readOnly value={value} onFocus={(e) => e.target.select()} aria-label="Link" />
      <button type="button" className="btn ghost small" onClick={async () => {
        try { await navigator.clipboard.writeText(value); toast('Copied'); } catch { ref.current?.select(); toast('Select the link and copy it'); }
      }}>{label}</button>
    </div>
  );
}

export function Loading({ text = 'Loading…' }) { return <div className="empty" role="status">{text}</div>; }

export function Header({ title, sub, logo, status, tabs, current, onTab, right }) {
  return (
    <header className="top">
      <div className="wrap">
        <div className="brandrow">
          <div className="id">
            {logo && <img className="logo" src={logo} alt="" />}
            <div className="wordmark">{title}{sub && <small>{sub}</small>}</div>
          </div>
          <div className="row">{right}{status}</div>
        </div>
        {tabs && (
          <nav className="tabs" aria-label="Sections" data-tour="tabs">
            {tabs.map(([k, label]) => <button key={k} type="button" aria-current={current === k ? 'page' : 'false'} onClick={() => onTab(k)}>{label}</button>)}
          </nav>
        )}
      </div>
    </header>
  );
}

export function LiveBadge({ event }) {
  if (!event) return null;
  const s = event.status;
  return <span className={'live ' + (s === 'live' ? '' : s === 'draft' ? 'draft' : 'off')}><i />{s === 'live' ? 'Live' : s === 'draft' ? 'Not started' : s === 'finished' ? 'Final' : 'Archived'}</span>;
}

export function Sponsors({ event }) {
  const list = (event?.sponsors || []).filter((s) => s.logo_url || s.name);
  if (!list.length) return null;
  return (
    <div className="sponsors" aria-label="Sponsors">
      {list.map((s, i) => (s.logo_url ? <img key={i} src={s.logo_url} alt={s.name || 'Sponsor'} title={s.name} /> : <b key={i}>{s.name}</b>))}
    </div>
  );
}

export function useHashTab(tabs, fallback) {
  const get = () => { const h = window.location.hash.slice(1); return tabs.includes(h) ? h : fallback; };
  const [tab, setTab] = useState(get);
  useEffect(() => { const f = () => setTab(get()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); });
  const go = (t) => { setTab(t); try { window.history.replaceState(null, '', '#' + t); } catch { /* ignore */ } window.scrollTo(0, 0); };
  return [tab, go];
}

export const fmtDate = (d) => { if (!d) return ''; const x = new Date(d + 'T12:00:00'); return x.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }); };
export const statusLabel = { draft: 'Draft', live: 'Live', finished: 'Finished', archived: 'Archived' };
