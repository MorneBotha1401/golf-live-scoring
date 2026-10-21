import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { BRAND, money } from '../lib/brand.js';
import { useDemo } from '../lib/useDemo.js';

function usePrice() {
  const [p, setP] = useState(BRAND.defaultPrice);
  useEffect(() => {
    supabase.from('app_settings').select('price_cents,currency').eq('id', 1).maybeSingle()
      .then(({ data }) => { if (data) setP({ cents: data.price_cents, currency: data.currency }); });
  }, []);
  return p;
}

function MiniBoard() {
  const { E, justScored } = useDemo({ every: 3000 });
  const m = E.lbModel();
  const rows = m.rows.slice(0, 7);
  return (
    <div className="mk-tv" aria-label="Sample live leaderboard">
      <div className="mk-tv-head">
        <div><b>Sunshine Charity Golf Day</b><span>Stableford · sample event</span></div>
        <span className="mk-live"><i />LIVE</span>
      </div>
      <table className="mk-tv-table">
        <thead><tr><th>Pos</th><th>Player</th><th>Thru</th><th>Pts</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const fresh = justScored && r.x.p && justScored.has(r.x.p.id);
            return (
              <tr key={r.id} className={fresh ? 'fresh' : ''}>
                <td>{r.pos}</td>
                <td><span className="nm">{r.label}</span>{r.div && <span className="dv">{r.div}</span>}</td>
                <td>{r.thru}</td>
                <td className="pts">{r.main.t}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mk-tv-foot">Updates the moment a player enters a score</div>
    </div>
  );
}

const FEATURES = [
  ['Players score on their own phones', 'Each player gets a private link or QR code. No app to download, no account, no password.'],
  ['Live leaderboard and clubhouse TV', 'Standings update the second a score goes in. Put the TV view on any screen in the clubhouse.'],
  ['Every format you play', 'Medal, Stableford, Betterball, 4-ball Alliance with any scores-to-count rule, and American Scramble.'],
  ['Scores checked as you go', 'Each player\'s score is checked against their marker\'s. Disagreements are flagged on the spot, not at the scorer\'s table.'],
  ['Handicaps done for you', 'Course and playing handicaps from slope and rating, shots per hole, net scores, points, divisions and countback.'],
  ['Your brand on everything', 'Your logo and sponsors on every phone, the leaderboard, the TV and the results.'],
  ['Results in one tap', 'A printable PDF, an image for WhatsApp, or plain text. Final results stay online after the day.'],
  ['Load your field in minutes', 'Type players in or import an Excel list. Players can also register themselves from a QR code.'],
];

const FAQ = [
  ['What do players need?', 'A phone with a browser. They open the link or scan the QR code you send them and their scorecard opens. They can save it to their home screen like an app.'],
  ['How many players can I have?', 'As many as your event has. The price is per event day, not per player.'],
  ['Our event runs over two days. What does it cost?', 'The price is per day of play, so a two-day event is two day passes. You choose the number of days when you set up the event.'],
  ['When do I pay?', 'Set up everything for free: the event, players, logos and links. Pay when you\'re ready, and scoring unlocks straight away. It can be opened from the day before your event.'],
  ['Which courses can I use?', 'Any course. Pick it from our course library or type in the scorecard: pars, stroke indexes, and the rating and slope of each tee.'],
  ['Can I get a refund?', `Yes, a full refund if you cancel at least ${BRAND.refundDays} days before the event and scoring hasn't been opened. See the refund policy for details.`],
  ['Who can see the scores?', 'The leaderboard is public once you open scoring, so friends and family can follow along. Players\' phone numbers and emails are only visible to you.'],
  ['Can someone help me run it?', 'Yes. Invite as many helpers as you like. They sign in with their email and can manage the event with you.'],
];

export default function Landing() {
  const price = usePrice();
  return (
    <div className="site">
      <header className="mk-nav">
        <div className="wrap wide mk-nav-in">
          <Link to="/" className="mk-logo"><img src="/icons/icon-192.png" alt="" width="32" height="32" />{BRAND.product}</Link>
          <nav className="mk-links" aria-label="Site">
            <a href="#how">How it works</a><a href="#features">Features</a><a href="#pricing">Pricing</a><Link to="/demo">Demo</Link>
            <Link to="/admin" className="mk-signin">Sign in</Link>
          </nav>
        </div>
      </header>

      <section className="mk-hero">
        <div className="wrap wide mk-hero-in">
          <div className="mk-hero-copy">
            <p className="mk-eyebrow">For golf days, charity events and club competitions</p>
            <h1>Live scoring your players run from their phones</h1>
            <p className="mk-lede">Players enter their scores hole by hole. The leaderboard and the clubhouse TV update the moment they do. You set it all up yourself in minutes.</p>
            <div className="mk-cta">
              <Link className="btn mk-btn" to="/start">Set up your event</Link>
              <Link className="btn ghost mk-btn" to="/demo">Try the live demo</Link>
            </div>
            <p className="mk-small">{money(price.cents, price.currency)} per event day · any number of players · pay only when you're ready</p>
          </div>
          <MiniBoard />
        </div>
      </section>

      <section id="how" className="mk-section">
        <div className="wrap wide">
          <h2>Ready in four steps</h2>
          <ol className="mk-steps">
            <li><b>Create your event</b><span>Name, date, course and format. Add your logo and sponsors.</span></li>
            <li><b>Load your players</b><span>Type them in or import a spreadsheet, then put them in four-balls.</span></li>
            <li><b>Send each player their link</b><span>By WhatsApp, email or a printed QR sheet at registration.</span></li>
            <li><b>Pay and go live</b><span>Scoring opens, the leaderboard goes up on the TV, and results are ready when the last group finishes.</span></li>
          </ol>
        </div>
      </section>

      <section id="features" className="mk-section mk-alt">
        <div className="wrap wide">
          <h2>Everything a golf day needs</h2>
          <div className="mk-features">
            {FEATURES.map(([t, d]) => <div key={t} className="mk-feature"><b>{t}</b><p>{d}</p></div>)}
          </div>
          <div className="mk-for">
            <div><b>Corporate golf days</b><span>Your brand on every screen, a polished leaderboard for the prize-giving, and no scorers' table.</span></div>
            <div><b>Charity fundraisers</b><span>Sponsor logos front and centre, and families following the leaderboard from home.</span></div>
            <div><b>Club competitions</b><span>Divisions, ladies, juniors and seniors, countback, and every alliance format.</span></div>
          </div>
        </div>
      </section>

      <section id="pricing" className="mk-section">
        <div className="wrap wide mk-pricing">
          <div>
            <h2>One simple price</h2>
            <p className="mk-lede-dark">No subscription and no per-player fees. Set everything up for free and pay for the day when you're ready.</p>
          </div>
          <div className="card mk-price">
            <div className="mk-amount">{money(price.cents, price.currency)}<span> per event day</span></div>
            <ul>
              <li>Unlimited players and helpers</li>
              <li>Every format, divisions and categories</li>
              <li>Live leaderboard and clubhouse TV</li>
              <li>Your logo and sponsors</li>
              <li>Results PDF, image and online archive</li>
            </ul>
            <Link className="btn mk-btn" to="/start">Set up your event</Link>
            <p className="note">Pay securely by card, Apple Pay or Google Pay. Receipt by email.</p>
          </div>
        </div>
      </section>

      <section className="mk-section mk-alt">
        <div className="wrap wide">
          <h2>Questions</h2>
          <div className="help-list mk-faq">
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><div className="help-a"><p>{a}</p></div></details>)}
          </div>
        </div>
      </section>

      <section className="mk-band">
        <div className="wrap wide mk-band-in">
          <h2>Have a golf day coming up?</h2>
          <div className="mk-cta"><Link className="btn mk-btn mk-btn-gold" to="/start">Set up your event</Link><Link className="btn ghost mk-btn" to="/demo">Try the demo first</Link></div>
        </div>
      </section>

      <footer className="mk-foot">
        <div className="wrap wide mk-foot-in">
          <span>© {new Date().getFullYear()} {BRAND.company}</span>
          <nav aria-label="Legal"><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link><Link to="/refunds">Refunds</Link><span>{BRAND.email}</span></nav>
        </div>
      </footer>
    </div>
  );
}
