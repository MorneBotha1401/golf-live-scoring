import { useState } from 'react';
import { errText, supabase } from '../lib/supabase.js';

/** Edit or add a course card: tees with rating and slope, and par, stroke index and length for each hole. */
export default function CourseEditor({ course, onDone, onCancel, toast, intro }) {
  const [c, setC] = useState(course); const [busy, setBusy] = useState(false);
  const lens = [...new Set(c.tees.map((t) => t.len))];
  const setHole = (i, patch) => setC((x) => { const holes = x.holes.slice(); holes[i] = { ...holes[i], ...patch }; return { ...x, holes }; });
  const setTee = (i, patch) => setC((x) => { const tees = x.tees.slice(); tees[i] = { ...tees[i], ...patch }; return { ...x, tees }; });
  const save = async () => {
    const si = c.holes.map((h) => +h.si); if (new Set(si).size !== 18 || si.some((v) => v < 1 || v > 18)) { toast('Stroke indexes must be 1 to 18, each used once'); return; }
    if (c.tees.some((t) => !t.code || !t.label)) { toast('Every tee needs a code and a name'); return; }
    if (new Set(c.tees.map((t) => t.code)).size !== c.tees.length) { toast('Tee codes must be different'); return; }
    setBusy(true);
    if (!c.name?.trim()) { toast('Give the course a name'); return; }
    const row = { club_id: c.club_id, name: c.name.trim(), location: c.location?.trim() || null, ...(c.id ? {} : { shared: c.shared !== false }), holes: c.holes.map((h) => ({ par: +h.par, si: +h.si, len: Object.fromEntries(lens.map((l) => [l, +(h.len?.[l] || 0)])) })), tees: c.tees.map((t) => ({ ...t, cr: +t.cr, slope: +t.slope })) };
    const { data, error } = c.id ? await supabase.from('courses').update(row).eq('id', c.id).select('id').single() : await supabase.from('courses').insert(row).select('id').single();
    setBusy(false); if (error) toast(errText(error)); else { toast('Course saved'); onDone(data?.id); }
  };
  return (
    <div className="card form">
      <h2>{c.id ? 'Edit course' : 'New course'}</h2>
      {intro}
      <div className="grid2">
        <label className="f">Course name<input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="e.g. Pecanwood Golf Estate" /></label>
        <label className="f">Town and country<input value={c.location || ''} onChange={(e) => setC({ ...c, location: e.target.value })} placeholder="e.g. Hartbeespoort, South Africa" /></label>
      </div>
      {!c.id && <label className="chk"><input type="checkbox" checked={c.shared !== false} onChange={(e) => setC({ ...c, shared: e.target.checked })} /> Add it to the course library so other organisers can pick it</label>}
      <fieldset><legend>Tees</legend>
        <div className="tscroll"><table className="list"><thead><tr><th>Code</th><th>Name</th><th>Distances</th><th>Gender</th><th>Rating</th><th>Slope</th><th /></tr></thead><tbody>
          {c.tees.map((t, i) => (
            <tr key={i}>
              <td><input value={t.code} onChange={(e) => setTee(i, { code: e.target.value.replace(/\W/g, '').slice(0, 6) })} style={{ width: 70 }} aria-label="Tee code" /></td>
              <td><input value={t.label} onChange={(e) => setTee(i, { label: e.target.value })} aria-label="Tee name" /></td>
              <td><input value={t.len} onChange={(e) => setTee(i, { len: e.target.value.replace(/\W/g, '').toLowerCase() })} style={{ width: 90 }} aria-label="Distance set" /></td>
              <td><select value={t.gender} onChange={(e) => setTee(i, { gender: e.target.value })} aria-label="Gender"><option value="M">Men</option><option value="F">Ladies</option></select></td>
              <td><input type="number" step="0.1" value={t.cr} onChange={(e) => setTee(i, { cr: e.target.value })} style={{ width: 80 }} aria-label="Course rating" /></td>
              <td><input type="number" value={t.slope} onChange={(e) => setTee(i, { slope: e.target.value })} style={{ width: 80 }} aria-label="Slope" /></td>
              <td>{c.tees.length > 1 && <button type="button" className="link" onClick={() => setC({ ...c, tees: c.tees.filter((_, k) => k !== i) })}>Remove</button>}</td>
            </tr>
          ))}
        </tbody></table></div>
        <div><button type="button" className="btn ghost small" onClick={() => setC({ ...c, tees: [...c.tees, { code: 'new', label: 'New tee', cr: 72, slope: 113, len: lens[0] || 'white', gender: 'M' }] })}>Add tee</button></div>
        <p className="note">"Distances" names the set of hole lengths a tee uses, so men's and ladies' red tees can share one set.</p>
      </fieldset>
      <fieldset><legend>Holes</legend>
        <div className="tscroll"><table className="list num"><thead><tr><th>Hole</th><th>Par</th><th>Stroke index</th>{lens.map((l) => <th key={l}>{l} (m)</th>)}</tr></thead><tbody>
          {c.holes.map((h, i) => (
            <tr key={i}><td>{i + 1}</td>
              <td><select value={h.par} onChange={(e) => setHole(i, { par: +e.target.value })} aria-label={`Par hole ${i + 1}`}>{[3, 4, 5, 6].map((p) => <option key={p}>{p}</option>)}</select></td>
              <td><input type="number" min="1" max="18" value={h.si} onChange={(e) => setHole(i, { si: +e.target.value })} aria-label={`Stroke index hole ${i + 1}`} /></td>
              {lens.map((l) => <td key={l}><input type="number" min="0" value={h.len?.[l] ?? 0} onChange={(e) => setHole(i, { len: { ...h.len, [l]: +e.target.value } })} aria-label={`${l} metres hole ${i + 1}`} /></td>)}
            </tr>
          ))}
        </tbody></table></div>
      </fieldset>
      <div className="btns"><button type="button" className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save course'}</button><button type="button" className="btn ghost" onClick={() => (onCancel || onDone)()}>Cancel</button></div>
    </div>
  );
}
