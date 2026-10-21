// "Add to home screen" support: platform detection, the browser's install prompt,
// and a per-player app manifest so the home-screen icon opens that player's own card.

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((f) => f());

export function initInstall() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem('a2hs', 'done'); } catch { /* ignore */ } notify(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
}
export const onInstallChange = (f) => { listeners.add(f); return () => listeners.delete(f); };
export const canPrompt = () => !!deferred;
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const e = deferred; deferred = null; notify();
  e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === 'accepted') { try { localStorage.setItem('a2hs', 'done'); } catch { /* ignore */ } }
  return outcome;
}

export function isStandalone() {
  try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch { return false; }
}

/** { os: 'ios'|'android'|'desktop', browser: 'safari'|'chrome'|'samsung'|'firefox'|'edge'|'inapp'|'other', safariMajor } */
export function platform() {
  const ua = navigator.userAgent || '';
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const os = /iPhone|iPad|iPod/.test(ua) || iPadOS ? 'ios' : /Android/.test(ua) ? 'android' : 'desktop';
  const inapp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|LinkedInApp|TikTok|MicroMessenger|GSA\//.test(ua) || (os === 'android' && /; wv\)/.test(ua));
  let browser = 'other';
  if (inapp) browser = 'inapp';
  else if (os === 'ios') browser = /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : /Safari/.test(ua) ? 'safari' : 'other';
  else if (/SamsungBrowser/.test(ua)) browser = 'samsung';
  else if (/Firefox/.test(ua)) browser = 'firefox';
  else if (/Edg\//.test(ua)) browser = 'edge';
  else if (/Chrome/.test(ua)) browser = 'chrome';
  const safariMajor = +(ua.match(/Version\/(\d+)/)?.[1] || 0);
  return { os, browser, safariMajor, iPad: /iPad/.test(ua) || iPadOS };
}

/**
 * Point the app manifest (and the iPhone title) at this player's own card, so the
 * home-screen icon opens it directly, even in the separate storage iPhones give
 * home-screen apps.
 */
export function setPlayerManifest({ url, name, shortName }) {
  const abs = (p) => new URL(p, location.origin).href;
  const manifest = {
    name, short_name: shortName, description: 'My live golf scorecard', start_url: abs(url), scope: abs('/'), id: abs(url),
    display: 'standalone', orientation: 'portrait', background_color: '#143823', theme_color: '#1c4a32',
    icons: [
      { src: abs('/icons/icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: abs('/icons/icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: abs('/icons/icon-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  const link = document.getElementById('app-manifest');
  if (link) {
    const old = link.getAttribute('href');
    link.setAttribute('href', URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' })));
    if (old && old.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(old), 5000);
  }
  const t = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (t) t.setAttribute('content', shortName);
}

const SNOOZE_DAYS = 3;
export function shouldOfferInstall() {
  try {
    const v = localStorage.getItem('a2hs');
    if (v === 'done') return false;
    if (v && v.startsWith('snooze:') && Date.now() < +v.slice(7)) return false;
  } catch { /* ignore */ }
  return !isStandalone();
}
export function snoozeInstall() { try { localStorage.setItem('a2hs', 'snooze:' + (Date.now() + SNOOZE_DAYS * 86400000)); } catch { /* ignore */ } }
export function doneInstall() { try { localStorage.setItem('a2hs', 'done'); } catch { /* ignore */ } }
