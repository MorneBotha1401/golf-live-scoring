// First-time guidance: spotlight tours, setup checklists and a help button.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/** Shows a tour automatically the first time `key` is seen on this device. */
export function useTour(key, ready = true) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (ready && !store.get('tour:' + key)) { const t = setTimeout(() => setOpen(true), 600); return () => clearTimeout(t); } return undefined; }, [key, ready]);
  const close = useCallback(() => { store.set('tour:' + key, '1'); setOpen(false); }, [key]);
  return { open, start: () => setOpen(true), close };
}

/**
 * steps: [{ target: 'css selector' | null, title, body, before?: () => void }]
 * The highlighted element gets a ring; the card sits beside it, or at the bottom on phones.
 */
export function Tour({ steps, open, onClose }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState(null);
  const step = steps[i];

  useEffect(() => { if (open) setI(0); }, [open]);
  useEffect(() => { if (open) step?.before?.(); }, [open, i]); // eslint-disable-line react-hooks/exhaustive-deps

  const measure = useCallback(() => {
    if (!open || !step?.target) { setBox(null); return; }
    const el = document.querySelector(step.target);
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
  }, [open, step]);

  useLayoutEffect(() => {
    if (!open || !step) return undefined;
    const t = setTimeout(() => {
      const el = step.target && document.querySelector(step.target);
      if (el) el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      setTimeout(measure, 350);
    }, step.before ? 250 : 30);
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open, i, step, measure]);

  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });

  if (!open || !step) return null;
  const last = i === steps.length - 1;
  function next() { if (last) onClose(); else setI((x) => x + 1); }
  const narrow = window.innerWidth < 640;
  let cardStyle;
  if (!box || narrow) cardStyle = { left: '50%', transform: 'translateX(-50%)', bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' };
  else {
    const below = box.top + box.height + 220 < window.innerHeight;
    const left = Math.min(Math.max(16, box.left), window.innerWidth - 376);
    cardStyle = below ? { top: box.top + box.height + 12, left } : { top: Math.max(16, box.top - 12), left, transform: 'translateY(-100%)' };
  }
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {box ? <div className="tour-hole" style={box} /> : <div className="tour-dim" />}
      <div className="tour-card" style={cardStyle}>
        <div className="tour-step">{i + 1} of {steps.length}</div>
        <h3 id="tour-title">{step.title}</h3>
        <div className="tour-body">{step.body}</div>
        <div className="tour-nav">
          <button type="button" className="link" onClick={onClose}>{last ? 'Close' : 'Skip tour'}</button>
          <div className="row">
            {i > 0 && <button type="button" className="btn ghost small" onClick={() => setI(i - 1)}>Back</button>}
            <button type="button" className="btn small" onClick={next} autoFocus>{last ? 'Got it' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HelpButton({ onClick, label = 'Show me around' }) {
  return <button type="button" className="helpbtn" onClick={onClick} aria-label={label} title={label}>?</button>;
}

/**
 * items: [{ key, label, hint, done, optional, action?: { label, onClick } }]
 * Collapses once everything required is done; can be hidden per device.
 */
export function Checklist({ id, title, items, intro }) {
  const [hidden, setHidden] = useState(() => store.get('check:' + id) === 'hidden');
  const required = items.filter((x) => !x.optional);
  const doneN = required.filter((x) => x.done).length;
  const allDone = doneN === required.length;
  const [open, setOpen] = useState(!allDone);
  useEffect(() => { if (allDone) setOpen(false); }, [allDone]);
  if (hidden) return <div className="note"><button type="button" className="link" onClick={() => { store.set('check:' + id, ''); setHidden(false); setOpen(true); }}>Show the {title.toLowerCase()} checklist</button></div>;
  const nextItem = items.find((x) => !x.done && !x.optional);
  return (
    <section className="card checklist" aria-label={title}>
      <button type="button" className="ck-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span><b>{title}</b><small>{allDone ? 'All set' : `${doneN} of ${required.length} done${nextItem ? ' · next: ' + nextItem.label.toLowerCase() : ''}`}</small></span>
        <span className="ck-bar" aria-hidden><i style={{ width: `${(doneN / Math.max(1, required.length)) * 100}%` }} /></span>
      </button>
      {open && (
        <div className="ck-body">
          {intro && <p className="note">{intro}</p>}
          <ol className="ck-list">
            {items.map((x) => (
              <li key={x.key} className={x.done ? 'done' : x === nextItem ? 'next' : ''}>
                <span className="ck-dot" aria-hidden>{x.done ? '✓' : ''}</span>
                <div className="ck-text"><b>{x.label}{x.optional && <em> · optional</em>}</b>{x.hint && <span>{x.hint}</span>}</div>
                {x.action && !x.done && <button type="button" className={'btn small' + (x === nextItem ? '' : ' ghost')} onClick={x.action.onClick}>{x.action.label}</button>}
              </li>
            ))}
          </ol>
          <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="link" onClick={() => { store.set('check:' + id, 'hidden'); setHidden(true); }}>Hide checklist</button></div>
        </div>
      )}
    </section>
  );
}

/** A one-line tip that can be dismissed for good on this device. */
export function Tip({ id, children }) {
  const [gone, setGone] = useState(() => store.get('tip:' + id) === '1');
  if (gone) return null;
  return (
    <div className="tip" role="note">
      <span className="tip-i" aria-hidden>i</span><div>{children}</div>
      <button type="button" className="tip-x" aria-label="Dismiss tip" onClick={() => { store.set('tip:' + id, '1'); setGone(true); }}>×</button>
    </div>
  );
}

/* ---------------- welcome screens ---------------- */

/** First visit: a welcome card first, then (if they want) the spotlight tour. */
export function useOnboarding(key, ready = true) {
  const [welcome, setWelcome] = useState(false);
  const [tour, setTour] = useState(false);
  useEffect(() => {
    if (ready && !store.get('tour:' + key)) { const t = setTimeout(() => setWelcome(true), 500); return () => clearTimeout(t); }
    return undefined;
  }, [key, ready]);
  const done = () => store.set('tour:' + key, '1');
  return {
    welcome, tour,
    startTour: () => { setWelcome(false); setTour(true); },
    skip: () => { done(); setWelcome(false); },
    closeTour: () => { done(); setTour(false); },
  };
}
export const seenTour = (key) => !!store.get('tour:' + key);

/** steps: [{ title, text }] — a real sequence, so it is numbered. */
export function Welcome({ open, title, intro, steps = [], facts = [], onTour, onSkip, tourLabel = 'Show me how', skipLabel = "I'll find my way" }) {
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onSkip(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onSkip]);
  if (!open) return null;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="tour-dim" />
      <div className="welcome-card">
        <h2 id="welcome-title">{title}</h2>
        {intro && <div className="tour-body">{intro}</div>}
        {facts.length > 0 && <dl className="welcome-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
        {steps.length > 0 && (
          <ol className="welcome-steps">
            {steps.map((s, i) => <li key={i}><span className="ws-n" aria-hidden>{i + 1}</span><div><b>{s.title}</b>{s.text && <span>{s.text}</span>}</div></li>)}
          </ol>
        )}
        <div className="tour-nav">
          <button type="button" className="link" onClick={onSkip}>{skipLabel}</button>
          {onTour && <button type="button" className="btn" onClick={onTour} autoFocus>{tourLabel}</button>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- help panel ---------------- */

// Tiny formatter for help answers: blank-line paragraphs, **bold**.
function rich(text) {
  return String(text).split(/\n+/).map((para, i) => (
    <p key={i}>{para.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith('**') && part.endsWith('**') ? <b key={j}>{part.slice(2, -2)}</b> : part))}</p>
  ));
}

/** topics: [{ q, a }] where a is plain text with **bold** and line breaks. */
export function HelpPanel({ open, onClose, title = 'Help', intro, topics = [], onTour, tourLabel = 'Show me around' }) {
  const [q, setQ] = useState('');
  useEffect(() => { if (!open) setQ(''); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = topics.filter((t) => { const hay = (t.q + ' ' + t.a).toLowerCase(); return words.every((w) => hay.includes(w)); });
  // Rendered at the end of the page so it sits above everything, including the sticky header.
  return createPortal(
    <div className="help-wrap" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="help-panel">
        <div className="spread">
          <h2 id="help-title">{title}</h2>
          <button type="button" className="tip-x" aria-label="Close help" onClick={onClose}>×</button>
        </div>
        {intro && <p className="note">{intro}</p>}
        {onTour && <button type="button" className="btn" onClick={() => { onClose(); onTour(); }}>{tourLabel}</button>}
        <input className="pick" type="search" placeholder="Search help, e.g. wrong score" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search help" autoFocus />
        <div className="help-list">
          {list.map((t) => (
            <details key={t.q} open={words.length > 0 && list.length <= 2}>
              <summary>{t.q}</summary>
              <div className="help-a">{rich(t.a)}</div>
            </details>
          ))}
          {!list.length && <p className="note">Nothing matches "{q}". Try another word, like score, link, group or TV.</p>}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

/** A help button plus its panel, in one piece for headers. */
export function Help({ topics, title, intro, onTour, tourLabel, label = 'Help' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <HelpButton onClick={() => setOpen(true)} label={label} />
      <HelpPanel open={open} onClose={() => setOpen(false)} {...{ topics, title, intro, onTour, tourLabel }} />
    </>
  );
}

/* ---------------- one-time prompts at the right moment ---------------- */

/**
 * items: [{ id, show, title, text, action?: { label, onClick } }]
 * Shows the first item whose condition is true and which hasn't been dismissed on this device.
 */
export function Coach({ items, paused }) {
  const [, bump] = useState(0);
  const item = items.find((x) => x.show && !store.get('coach:' + x.id));
  if (!item || paused) return null;
  const dismiss = () => { store.set('coach:' + item.id, '1'); bump((n) => n + 1); };
  return (
    <div className="coach" role="status" aria-live="polite">
      <div className="coach-body"><b>{item.title}</b>{item.text && <span>{item.text}</span>}</div>
      <div className="row">
        {item.action && <button type="button" className="btn small" onClick={() => { item.action.onClick(); dismiss(); }}>{item.action.label}</button>}
        <button type="button" className="btn ghost small" onClick={dismiss}>Got it</button>
      </div>
    </div>
  );
}

/** "Next:" nudge pointing at the obvious next step. */
export function NextStep({ children, action }) {
  return (
    <div className="nextstep" role="note">
      <span className="ns-arrow" aria-hidden>→</span>
      <div><b>Next: </b>{children}</div>
      {action && <button type="button" className="btn small" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
