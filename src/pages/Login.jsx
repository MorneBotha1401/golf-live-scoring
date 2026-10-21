import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errText, supabase } from '../lib/supabase.js';
import { Header } from '../components/ui.jsx';

export default function Login() {
  const [sp] = useSearchParams();
  const next = sp.get('next') || '/admin';
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin + next } });
    setBusy(false); if (error) setErr(errText(error)); else setSent(true);
  };
  return (
    <>
      <Header title="Organiser sign in" sub="Club and event administrators" />
      <main><div className="wrap">
        <form className="card form" onSubmit={submit} style={{ maxWidth: 460 }}>
          {sent ? (<><h2>Check your email</h2><p>We sent a sign-in link to <b>{email}</b>. Open it on this device, in this same browser, to continue. The link works once.</p><p className="note">Nothing after a minute? Check your spam folder. Links can only be sent a few times an hour, so wait a few minutes before asking again.</p><button type="button" className="link" onClick={() => setSent(false)}>Use a different email</button></>) : (
            <>
              <h2>Sign in</h2>
              <p className="note">Enter your email and we'll send you a sign-in link. No password needed. Players don't sign in here: they use the personal link from the organiser.</p>
              <label className="f">Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
              {sp.get('expired') && !err && <div className="banner warn">That sign-in link has expired or was already used. Each link works once. Send yourself a new one and open it in this same browser.</div>}
              {err && <div className="banner bad">{err}</div>}
              <div><button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send sign-in link'}</button></div>
              <ol className="howto">
                <li><b>Open the link in your email</b><span>On this same device and in this same browser.</span></li>
                <li><b>Create your club</b><span>Or open the club or event you were invited to.</span></li>
                <li><b>Follow the checklist</b><span>It shows what to do next and ticks itself off.</span></li>
              </ol>
            </>
          )}
        </form>
      </div></main>
    </>
  );
}
