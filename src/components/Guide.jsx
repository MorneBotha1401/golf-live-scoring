// First-time guidance: spotlight tours, setup checklists and a help button.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

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
