import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import { configured } from './lib/supabase.js';
import { initInstall } from './lib/install.js';

initInstall();
import { ToastProvider } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import AdminHome from './pages/AdminHome.jsx';
import ClubAdmin from './pages/ClubAdmin.jsx';
import EventAdmin from './pages/EventAdmin.jsx';
import InviteAccept from './pages/InviteAccept.jsx';
import PlayerClaim from './pages/PlayerClaim.jsx';
import PlayerApp from './pages/PlayerApp.jsx';
import PublicEvent from './pages/PublicEvent.jsx';
import TvPage from './pages/TvPage.jsx';
import JoinPage from './pages/JoinPage.jsx';

function NotConfigured() {
  return (
    <main><div className="wrap"><div className="card pad stack">
      <h1>Almost there</h1>
      <p>This site isn't connected to its database yet. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to the site's environment variables, then redeploy. The README explains each step.</p>
    </div></div></main>
  );
}

function NotFound() {
  return <main><div className="wrap"><div className="card"><div className="empty"><b>Page not found</b><a href="/">Go to the start page</a></div></div></div></main>;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {!configured ? <NotConfigured /> : (
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<AdminHome />} />
            <Route path="/admin/club/:clubId" element={<ClubAdmin />} />
            <Route path="/admin/event/:eventId" element={<EventAdmin />} />
            <Route path="/invite/:token" element={<InviteAccept />} />
            <Route path="/p/:token" element={<PlayerClaim />} />
            <Route path="/play/:slug" element={<PlayerApp />} />
            <Route path="/e/:slug" element={<PublicEvent />} />
            <Route path="/e/:slug/tv" element={<TvPage />} />
            <Route path="/e/:slug/join" element={<JoinPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    )}
  </React.StrictMode>,
);
