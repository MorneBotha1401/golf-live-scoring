import { useEffect, useMemo, useRef, useState } from 'react';
import { makeEngine } from './engine.js';
import { demoClub, demoCourse, demoEvent, demoPlayers, initialDemoScores, nextDemoHole } from './demoData.js';

/** A sample event that keeps scoring by itself, for the public site and the demo. */
export function useDemo({ every = 3500, running = true } = {}) {
  const [scores, setScores] = useState(initialDemoScores);
  const [extra, setExtra] = useState([]); // the visitor's own entries in the phone demo
  const last = useRef(null);
  useEffect(() => {
    if (!running) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = setInterval(() => setScores((s) => {
      const add = nextDemoHole(s);
      if (!add) return initialDemoScores(); // round finished: start again
      last.current = new Set(add.map((x) => x.player_id));
      return [...s, ...add];
    }), reduce ? every * 2 : every);
    return () => clearInterval(t);
  }, [every, running]);
  const all = useMemo(() => {
    const keep = scores.filter((s) => !extra.some((e) => e.player_id === s.player_id && e.hole === s.hole && e.role === s.role));
    return [...keep, ...extra];
  }, [scores, extra]);
  const E = useMemo(() => makeEngine({ event: demoEvent, course: demoCourse, players: demoPlayers, scores: all, teamScores: [] }), [all]);
  return { E, event: demoEvent, club: demoClub, scores: all, setExtra, justScored: last.current };
}
