// Load one event with everything needed to score it, and keep it live.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';

async function fetchAll(build) {
  const out = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

const upsert = (list, row, key = 'id') => { const i = list.findIndex((x) => x[key] === row[key]); if (i < 0) return [...list, row]; const n = list.slice(); n[i] = { ...n[i], ...row }; return n; };
const remove = (list, row, key = 'id') => list.filter((x) => x[key] !== row[key]);

/**
 * where: { slug } or { id }
 * opts.scope: null = listen to the whole event; array of player ids = listen to those players' scores only
 * (keeps phone traffic low; the leaderboard tab switches to the whole event).
 */
export function useEventData(where, opts = {}) {
  const [st, setSt] = useState({ loading: true, error: null, event: null, club: null, course: null, players: [], scores: [], teamScores: [], updatedAt: null });
  const idRef = useRef(null);
  const scopeKey = opts.scope ? opts.scope.slice().sort().join(',') : 'all';

  const load = useCallback(async () => {
    try {
      let q = supabase.from('events').select('*');
      q = where.id ? q.eq('id', where.id) : q.eq('slug', where.slug);
      const { data: event, error } = await q.maybeSingle();
      if (error) throw error;
      if (!event) { setSt((s) => ({ ...s, loading: false, error: 'not_found' })); return; }
      idRef.current = event.id;
      const [club, course, players, scores, teamScores] = await Promise.all([
        supabase.from('clubs').select('*').eq('id', event.club_id).single().then((r) => r.data),
        supabase.from('courses').select('*').eq('id', event.course_id).single().then((r) => r.data),
        fetchAll(() => supabase.from('players').select('*').eq('event_id', event.id).order('id')),
        fetchAll(() => supabase.from('scores').select('id,player_id,hole,role,strokes,updated_at').eq('event_id', event.id).order('id')),
        fetchAll(() => supabase.from('team_scores').select('id,team_key,hole,strokes,drive_player,updated_at').eq('event_id', event.id).order('id')),
      ]);
      setSt({ loading: false, error: null, event, club, course, players, scores, teamScores, updatedAt: new Date() });
    } catch (e) {
      setSt((s) => ({ ...s, loading: false, error: e.message || String(e) }));
    }
  }, [where.id, where.slug]);

  useEffect(() => { load(); }, [load]);

  // Live updates
  useEffect(() => {
    const id = st.event?.id; if (!id) return undefined;
    const scoreFilter = opts.scope && opts.scope.length ? `player_id=in.(${opts.scope.join(',')})` : `event_id=eq.${id}`;
    let first = true;
    const ch = supabase.channel(`event-${id}-${scopeKey}`);
    const onScore = (p) => setSt((s) => ({ ...s, updatedAt: new Date(), scores: p.eventType === 'DELETE' ? remove(s.scores, p.old) : upsert(s.scores, p.new) }));
    const onTeam = (p) => setSt((s) => ({ ...s, updatedAt: new Date(), teamScores: p.eventType === 'DELETE' ? remove(s.teamScores, p.old) : upsert(s.teamScores, p.new) }));
    const onPlayer = (p) => setSt((s) => ({ ...s, players: p.eventType === 'DELETE' ? remove(s.players, p.old) : upsert(s.players, p.new) }));
    // Supabase cannot filter DELETE events, so deletes are matched by row id (unknown ids are ignored).
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scores', filter: scoreFilter }, onScore)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'scores', filter: scoreFilter }, onScore)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'scores' }, onScore)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_scores', filter: `event_id=eq.${id}` }, onTeam)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'team_scores', filter: `event_id=eq.${id}` }, onTeam)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `event_id=eq.${id}` }, onPlayer)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `event_id=eq.${id}` }, onPlayer)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'players' }, onPlayer)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${id}` }, (p) => setSt((s) => ({ ...s, event: { ...s.event, ...p.new } })))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { if (!first) load(); first = false; }
      });
    // Phones sleep: catch up when the screen comes back.
    const vis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', vis);
    // Safety net if the live connection silently drops.
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 300000);
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', vis); clearInterval(t); };
  }, [st.event?.id, scopeKey, load]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...st, reload: load, setSt };
}
