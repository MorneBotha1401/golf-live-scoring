import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { canPrompt, doneInstall, onInstallChange, platform, promptInstall, snoozeInstall } from '../lib/install.js';

/* Small drawings of the buttons players have to find, so they recognise them. */
const IconShare = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);
const IconAdd = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8M8 12h8" />
  </svg>
);
const IconDots = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
);
const IconKebab = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
);
const IconMenu = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
const Key = ({ children }) => <span className="a2-key">{children}</span>;

function stepsFor(os, browser, safariMajor, iPad) {
  if (browser === 'inapp') return { inapp: true };
  if (os === 'ios') {
    if (browser === 'safari' && safariMajor >= 26) return { steps: [
      <>Tap <Key><IconDots /></Key> at the {iPad ? 'top right' : 'bottom right, next to the address bar'}.</>,
      <>Tap <Key><IconShare /> Share</Key>.</>,
      <>Scroll down and tap <Key><IconAdd /> Add to Home Screen</Key>.</>,
      <>Leave <b>Open as Web App</b> on, then tap <b>Add</b>.</>,
    ] };
    if (browser === 'safari') return { steps: [
      <>Tap the Share button <Key><IconShare /></Key> {iPad ? 'at the top right' : 'in the bar at the bottom of the screen'}.</>,
      <>Scroll down and tap <Key><IconAdd /> Add to Home Screen</Key>.</>,
      <>Tap <b>Add</b> at the top right.</>,
    ], arrow: !iPad && safariMajor < 26 };
    if (browser === 'chrome' || browser === 'edge') return { steps: [
      <>Tap the Share button <Key><IconShare /></Key> in the address bar at the top.</>,
      <>Scroll down and tap <Key><IconAdd /> Add to Home Screen</Key>.</>,
      <>Tap <b>Add</b>.</>,
    ] };
    return { steps: [<>Open this page in <b>Safari</b>, then tap <Key><IconShare /></Key> and <b>Add to Home Screen</b>.</>], copy: true };
  }
  if (os === 'android') {
    if (browser === 'samsung') return { steps: [
      <>Tap <Key><IconMenu /></Key> at the bottom right.</>,
      <>Tap <b>Add page to</b>, then <b>Home screen</b>.</>,
      <>Tap <b>Add</b>.</>,
    ] };
    if (browser === 'firefox') return { steps: [
      <>Tap <Key><IconKebab /></Key> at the top or bottom right.</>,
      <>Tap <b>Add to Home screen</b> (or <b>Install</b>).</>,
      <>Tap <b>Add</b>.</>,
    ] };
    return { steps: [
      <>Tap <Key><IconKebab /></Key> at the top right.</>,
      <>Tap <b>Add to Home screen</b> or <b>Install app</b>.</>,
      <>Tap <b>Install</b> or <b>Add</b>.</>,
    ] };
  }
  return { desktop: true };
}

/**
 * The "save to home screen" pop-up.
 * label: the name under the icon (event short name). url: the player's personal link, for copying.
 */
export default function InstallSheet({ open, onClose, label, url }) {
  const p = platform();
  const [tab, setTab] = useState(p.os === 'android' ? 'android' : 'ios');
  const [, bump] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => onInstallChange(() => bump((n) => n + 1)), []);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') { snoozeInstall(); onClose(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;

  const onPhone = p.os !== 'desktop';
  const shownOs = onPhone ? p.os : tab;
  const info = onPhone ? stepsFor(p.os, p.browser, p.safariMajor, p.iPad)
    : stepsFor(tab, tab === 'ios' ? 'safari' : 'chrome', 26, false);
  const prompt = canPrompt();
  const close = (how) => { if (how === 'done') doneInstall(); else snoozeInstall(); onClose(); };
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); } };

  return createPortal(
    <div className="a2-wrap" role="dialog" aria-modal="true" aria-labelledby="a2-title" onMouseDown={(e) => { if (e.target === e.currentTarget) close('later'); }}>
      <div className={'a2-sheet' + (onPhone && info.arrow ? ' has-arrow' : '')}>
        <div className="a2-head">
          <div className="a2-preview" aria-hidden="true">
            <img src="/icons/icon-192.png" alt="" width="64" height="64" />
            <span>{label}</span>
          </div>
          <div>
            <h2 id="a2-title">Save your scorecard to your home screen</h2>
            <p className="note">Then it's one tap away on every hole: full screen, no hunting for the link.</p>
          </div>
        </div>

        {!onPhone && (
          <>
            <p className="banner">You're on a computer. Open your personal link on your phone and you'll see this there too. Here's how it works on each phone:</p>
            <div className="chips" role="tablist" aria-label="Phone type">
              <button type="button" role="tab" className="chip" aria-pressed={tab === 'ios'} onClick={() => setTab('ios')}>iPhone</button>
              <button type="button" role="tab" className="chip" aria-pressed={tab === 'android'} onClick={() => setTab('android')}>Android</button>
            </div>
          </>
        )}

        {onPhone && prompt && (
          <button type="button" className="btn a2-big" onClick={async () => { const r = await promptInstall(); if (r === 'accepted') close('done'); }}>
            Add to home screen
          </button>
        )}

        {info.inapp ? (
          <div className="stack">
            <p>You've opened your link inside another app, which can't add it to your home screen. Open it in <b>{p.os === 'ios' ? 'Safari' : 'Chrome'}</b> first:</p>
            <ol className="a2-steps">
              <li><span className="ws-n">1</span><div>Tap the <Key>{p.os === 'ios' ? <IconDots /> : <IconKebab />}</Key> or <Key><IconShare /></Key> button in this app's browser.</div></li>
              <li><span className="ws-n">2</span><div>Choose <b>Open in {p.os === 'ios' ? 'Safari' : 'Chrome'}</b> (or <b>Open in browser</b>).</div></li>
              <li><span className="ws-n">3</span><div>This pop-up shows again there with the last steps.</div></li>
            </ol>
            {url && <button type="button" className="btn ghost" onClick={copy}>{copied ? 'Link copied. Paste it in your browser.' : 'Copy my link instead'}</button>}
          </div>
        ) : info.desktop ? null : (
          <>
            {onPhone && prompt && <p className="note">Or do it yourself:</p>}
            <ol className="a2-steps">
              {info.steps.map((s, i) => <li key={i}><span className="ws-n">{i + 1}</span><div>{s}</div></li>)}
            </ol>
            {info.copy && url && <button type="button" className="btn ghost" onClick={copy}>{copied ? 'Link copied' : 'Copy my link'}</button>}
            {!onPhone && <p className="note">{shownOs === 'ios' ? 'Older iPhones show the Share button in the bar at the bottom instead of behind •••.' : 'On Samsung phones, use ☰ at the bottom right, then Add page to → Home screen.'}</p>}
          </>
        )}

        <div className="a2-nav">
          <button type="button" className="link" onClick={() => close('later')}>Not now</button>
          <button type="button" className="btn" onClick={() => close('done')}>{onPhone ? "I've added it" : 'Got it'}</button>
        </div>
      </div>
      {onPhone && info.arrow && <div className="a2-arrow" aria-hidden="true">↓</div>}
    </div>,
    document.body,
  );
}
