import { Link, useLocation } from 'react-router-dom';
import { BRAND, money } from '../lib/brand.js';
import { Header } from '../components/ui.jsx';

// Plain-language starting points. Have a lawyer review them before you rely on them.
const updated = '21 October 2026';

function Terms() {
  return (
    <>
      <h1>Terms of use</h1>
      <p className="note">Last updated {updated}</p>
      <h2>Who we are</h2>
      <p>{BRAND.product} is provided by {BRAND.company} ({BRAND.companyDetails}). Contact us at {BRAND.email}.</p>
      <h2>The service</h2>
      <p>{BRAND.product} lets organisers set up golf events, invite players, and run live scoring, leaderboards and results. Organisers ("you") create an account with their email address. Players use a private link from the organiser and do not need an account.</p>
      <h2>Paying for events</h2>
      <p>Setting up an event is free. Opening scoring requires an event day pass for each day of play, at the price shown when you pay (currently {money(BRAND.defaultPrice.cents, BRAND.defaultPrice.currency)} per event day). Payments are processed by our payment provider; we do not see or store your card details. A pass covers one event on the dates you set; scoring can be opened from the day before the first day until the day after the last day. Passes can't be moved to another event.</p>
      <h2>Your responsibilities</h2>
      <p>You are responsible for the information you enter, including players' details, course data, handicaps and rules, and for having your players' permission to add them. Final results are the responsibility of the event's committee. Keep players' personal links private: anyone with a link can score as that player.</p>
      <h2>Acceptable use</h2>
      <p>Don't use the service for anything unlawful, to upload content you don't have the rights to (including logos), or to try to access other organisers' events or data.</p>
      <h2>Availability</h2>
      <p>We work hard to keep the service running, but it depends on mobile signal, internet providers and third-party services. We can't guarantee it will be uninterrupted. Keep a backup plan (such as paper cards) for important events.</p>
      <h2>Liability</h2>
      <p>To the extent the law allows, our total liability for any event is limited to the amount you paid for that event. We are not liable for indirect losses, such as lost sponsorship or prize disputes.</p>
      <h2>Changes and law</h2>
      <p>We may update these terms; the date above shows the latest version. These terms are governed by the laws of {BRAND.country}.</p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="note">Last updated {updated}</p>
      <p>This policy explains what personal information {BRAND.product} handles and why. It is written with the South African Protection of Personal Information Act (POPIA) and similar laws in mind.</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>Organisers:</b> email address, organisation name and country, and payment records (amount, date, receipt). Card details are handled by our payment provider, not by us.</li>
        <li><b>Players:</b> name, handicap index, gender and category (for divisions and tees), group, scores, and optionally a mobile number and email address that the organiser uses to send their scorecard link.</li>
        <li><b>Technical:</b> an anonymous sign-in token on players' phones so the scorecard stays linked, and basic server logs.</li>
      </ul>
      <h2>How it's used</h2>
      <p>To run the event: calculate handicaps and results, show leaderboards, let organisers contact players, and take payment. We don't sell personal information or use it for advertising.</p>
      <h2>Who can see what</h2>
      <p>Once an event is live, players' names, handicaps and scores appear on that event's public leaderboard. Mobile numbers and emails are visible only to that event's organisers. Draft events are private.</p>
      <h2>Organisers' role</h2>
      <p>The organiser decides which players to add and is responsible for having their permission. We process player information on the organiser's behalf.</p>
      <h2>Keeping and deleting</h2>
      <p>Results stay in the organiser's archive until the organiser deletes the event. Deleting an event deletes its players and scores. Payment records are kept as tax law requires.</p>
      <h2>Your rights</h2>
      <p>You can ask to see, correct or delete your information. Players should contact the event organiser first; anyone can contact us at {BRAND.email}.</p>
      <h2>Where data is stored</h2>
      <p>Data is stored with our hosting providers (Supabase and Netlify), which may be outside your country, with appropriate safeguards.</p>
    </>
  );
}

function Refunds() {
  return (
    <>
      <h1>Refund policy</h1>
      <p className="note">Last updated {updated}</p>
      <ul>
        <li><b>Full refund</b> if you cancel at least {BRAND.refundDays} days before the event date and scoring has not been opened.</li>
        <li><b>Event postponed?</b> Change the date under Event details before scoring starts, and your pass moves with it. No refund needed.</li>
        <li><b>Within {BRAND.refundDays} days of the event, or once scoring has been opened,</b> passes are not refundable, except where the service failed and you couldn't use it.</li>
        <li>Weather cancellations on the day: contact us and we'll credit a replacement date.</li>
      </ul>
      <p>To ask for a refund, email {BRAND.email} with your event name and date. Refunds go back to the card you paid with, normally within 5–10 working days.</p>
    </>
  );
}

export default function Legal() {
  const { pathname } = useLocation();
  const page = pathname.includes('privacy') ? <Privacy /> : pathname.includes('refund') ? <Refunds /> : <Terms />;
  return (
    <>
      <Header title={BRAND.product} sub="Legal" logo="/icons/icon-192.png" right={<span className="hdrlinks"><Link to="/">Home</Link></span>} />
      <main><div className="wrap"><article className="card pad legal">{page}
        <p className="note"><Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link> · <Link to="/refunds">Refunds</Link></p>
      </article></div></main>
    </>
  );
}
