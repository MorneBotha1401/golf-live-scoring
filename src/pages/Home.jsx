import { Link } from 'react-router-dom';
import { Header } from '../components/ui.jsx';

export default function Home() {
  return (
    <>
      <Header title="Live Golf Scoring" sub="Live leaderboards and player scorecards for club competitions and golf days" />
      <main><div className="wrap">
        <div className="card pad stack">
          <h2>Players</h2>
          <p>Open the personal link or scan the QR code the organiser gave you. It takes you straight to your scorecard, with no sign-up.</p>
        </div>
        <div className="card pad stack">
          <h2>Organisers</h2>
          <p>Set up events, load the field, send player links and run the leaderboard and clubhouse TV.</p>
          <div><Link className="btn" to="/admin">Organiser sign in</Link></div>
        </div>
      </div></main>
    </>
  );
}
