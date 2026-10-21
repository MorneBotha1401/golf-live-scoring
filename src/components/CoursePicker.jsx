import { useEffect, useState } from 'react';
import { errText, supabase } from '../lib/supabase.js';
import { PRESETS } from '../lib/presets.js';
import CourseEditor from './CourseEditor.jsx';

const par = (c) => c.holes.reduce((a, h) => a + (+h.par || 0), 0);

/**
 * Choose the course for an event: one of this organisation's courses, one from the
 * shared library (copied into the organisation), or a new one typed in.
 * onPick(courseId) is called with a course that belongs to the organisation.
 */
export default function CoursePicker({ clubId, value, onPick, toast }) {
  const [own, setOwn] = useState(null);
  const [lib, setLib] = useState([]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState('');

  const load = async () => {
    const [{ data: mine }, { data: shared }] = await Promise.all([
      supabase.from('courses').select('id,name,location,holes,tees,verified,source_course_id').eq('club_id', clubId).order('name'),
      supabase.from('courses').select('id,name,location,holes,tees,verified').eq('shared', true).order('name').limit(500),
    ]);
    setOwn(mine || []); setLib((shared || []).filter((c) => !(mine || []).some((m) => m.id === c.id || m.source_course_id === c.id)));
  };
  useEffect(() => { load(); }, [clubId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fromLibrary = async (c) => {
    setBusy(c.id);
    const { data, error } = await supabase.rpc('copy_course', { p_course: c.id, p_club: clubId });
    setBusy('');
    if (error) { toast(errText(error)); return; }
    await load(); onPick(data);
  };

  if (own === null) return <p className="note">Loading courses…</p>;
  if (adding) {
    return <CourseEditor course={{ id: null, club_id: clubId, location: '', shared: true, ...JSON.parse(JSON.stringify(PRESETS.blank)), name: q }} toast={toast}
      intro={<p className="note">Copy the details from the course's scorecard. Ratings and slopes are on the card or from the club's handicap office.</p>}
      onCancel={() => setAdding(false)} onDone={async (id) => { setAdding(false); await load(); if (id) onPick(id); }} />;
  }
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (c) => words.every((w) => `${c.name} ${c.location || ''}`.toLowerCase().includes(w));
  const libShown = lib.filter(match).slice(0, 12);
  return (
    <div className="stack picker">
      {own.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <h3>Your courses</h3>
          {own.map((c) => (
            <label key={c.id} className={'pick-row' + (value === c.id ? ' on' : '')}>
              <input type="radio" name="course" checked={value === c.id} onChange={() => onPick(c.id)} />
              <span><b>{c.name}</b><small>{[c.location, `Par ${par(c)}`, c.tees.map((t) => t.label).join(', ')].filter(Boolean).join(' · ')}</small></span>
            </label>
          ))}
        </div>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <h3>Course library</h3>
        <input className="pick" type="search" placeholder="Search by course or town" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the course library" />
        {libShown.map((c) => (
          <div key={c.id} className="pick-row">
            <span><b>{c.name}</b>{c.verified && <em className="flag ok">Checked</em>}<small>{[c.location, `Par ${par(c)}`, c.tees.map((t) => `${t.label} ${t.cr}/${t.slope}`).join(', ')].filter(Boolean).join(' · ')}</small></span>
            <button type="button" className="btn small ghost" disabled={!!busy} onClick={() => fromLibrary(c)}>{busy === c.id ? 'Adding…' : 'Use this course'}</button>
          </div>
        ))}
        {!libShown.length && <p className="note">{q ? `No library course matches "${q}".` : 'The library is empty so far.'}</p>}
      </div>
      <div className="spread"><span className="note">Not listed? Type in the scorecard once and it's saved for next time.</span><button type="button" className="btn small" onClick={() => setAdding(true)}>Add a new course</button></div>
    </div>
  );
}
