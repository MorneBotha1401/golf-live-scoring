import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ensureSession, errText, supabase } from '../lib/supabase.js';

// Opening a personal link: sign this phone in quietly and bind it to that player.
export default function PlayerClaim() {
  const { token } = useParams();
  const nav = useNavigate();
  const [err, setErr] = useState('');
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        await ensureSession();
        const { data, error } = await supabase.rpc('claim_player', { p_token: token });
        if (error) throw error;
        try {
          localStorage.setItem('player:' + data.slug, data.player_id);
          localStorage.setItem('token:' + data.slug, token);
          localStorage.setItem('claimed:' + token, '1');
        } catch { /* private mode */ }
        // Keep the personal code in the address, so a home-screen icon made from this page still works.
        if (on) nav(`/play/${data.slug}?k=${encodeURIComponent(token)}`, { replace: true });
      } catch (e) { if (on) setErr(errText(e)); }
    })();
    return () => { on = false; };
  }, [token, nav]);
  return (
    <main><div className="wrap">
      <div className="card"><div className="empty">
        {err ? <><b>We couldn't open your scorecard</b>{err}</> : <><b>Opening your scorecard…</b>One moment.</>}
      </div></div>
    </div></main>
  );
}
