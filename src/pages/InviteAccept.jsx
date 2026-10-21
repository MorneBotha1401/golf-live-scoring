import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errText, isRealUser, supabase } from '../lib/supabase.js';
import { Header, Loading, useSession } from '../components/ui.jsx';

export default function InviteAccept() {
  const { token } = useParams(); const session = useSession(); const nav = useNavigate();
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!isRealUser(session)) return;
    (async () => {
      const { data, error } = await supabase.rpc('accept_invite', { p_token: token });
      if (error) { setErr(errText(error)); return; }
      nav(data.role === 'club_admin' ? `/admin/club/${data.club_id}` : `/admin/event/${data.event_id}`, { replace: true });
    })();
  }, [session, token, nav]);
  if (session === undefined) return <Loading />;
  return (
    <>
      <Header title="Invitation" sub="Help run events" />
      <main><div className="wrap"><div className="card pad stack" style={{ maxWidth: 520 }}>
        {!isRealUser(session) ? (<><h2>You've been invited</h2><p>Sign in with your email to accept the invitation.</p><div><Link className="btn" to={`/login?next=${encodeURIComponent('/invite/' + token)}`}>Sign in to accept</Link></div></>)
          : err ? (<><h2>Couldn't accept the invite</h2><p>{err}</p><Link to="/admin">Go to my events</Link></>) : <p>Accepting the invitation…</p>}
      </div></div></main>
    </>
  );
}
