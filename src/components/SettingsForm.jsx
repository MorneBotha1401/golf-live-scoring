import { FORMATS, DEFAULT_SETTINGS } from '../lib/engine.js';

const COUNT = [['1', '1'], ['2', '2'], ['3', '3'], ['0', 'All']];
const num = (v) => (v === '' || v == null ? null : +v);

/** value = { format, settings }  — calls onChange with the same shape */
export default function SettingsForm({ value, onChange, course }) {
  const f = value.format;
  const s = { ...DEFAULT_SETTINGS, ...value.settings, count: { ...DEFAULT_SETTINGS.count, ...(value.settings?.count || {}) }, divLimits: { ...DEFAULT_SETTINGS.divLimits, ...(value.settings?.divLimits || {}) } };
  const set = (patch) => onChange({ format: f, settings: { ...s, ...patch } });
  const setCount = (patch) => set({ count: { ...s.count, ...patch } });
  const show = (...fs) => fs.includes(f);
  const pars = (course?.holes || []).map((h) => h.par);
  const custom = !!(s.count.holes && s.count.holes.some((v) => v != null));

  return (
    <div className="stack">
      <label className="f">Format
        <select value={f} onChange={(e) => onChange({ format: e.target.value, settings: s })}>
          <option value="stroke">Medal (stroke play)</option>
          <option value="stableford">Individual Stableford</option>
          <option value="betterball">Betterball Stableford</option>
          <option value="alliance">4-ball Alliance</option>
          <option value="scramble">American Scramble · one team score</option>
          <option value="scramble_drive">American Scramble · drive, then own ball</option>
        </select>
      </label>
      <p className="note">{FORMATS[f].help}</p>
      <div className="grid2">
        {!show('scramble') && <label className="f">Handicap allowance %<input type="number" min="0" max="100" value={s.allowance} onChange={(e) => set({ allowance: Math.max(0, Math.min(100, +e.target.value || 0)) })} /></label>}
        {show('stroke') && <label className="f">Ranked on<select value={s.basis} onChange={(e) => set({ basis: e.target.value })}><option value="net">Net score</option><option value="gross">Gross score</option></select></label>}
        {show('scramble') && <label className="f">Team scored as<select value={s.scrScoring} onChange={(e) => set({ scrScoring: e.target.value })}><option value="net">Net strokes</option><option value="stableford">Stableford points</option></select></label>}
        {show('scramble') && <label className="f">Team handicap, % of combined<input type="number" min="0" max="100" step="0.5" value={s.teamPct} onChange={(e) => set({ teamPct: Math.max(0, Math.min(100, +e.target.value || 0)) })} /></label>}
      </div>

      {show('alliance', 'scramble_drive') && (
        <fieldset>
          <legend>Scores to count</legend>
          <div className="grid2">
            <label className="f">On every hole<select value={String(s.count.base)} onChange={(e) => setCount({ base: +e.target.value })}>{COUNT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            {[3, 4, 5].map((p) => (
              <label key={p} className="f">Par {p}s<select value={s.count['p' + p] == null ? '' : String(s.count['p' + p])} onChange={(e) => setCount({ ['p' + p]: num(e.target.value) })}>
                <option value="">Same as every hole</option>{COUNT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            ))}
          </div>
          <label className="chk"><input type="checkbox" checked={custom} onChange={(e) => setCount({ holes: e.target.checked ? Array(18).fill(null) : null })} /> Set holes individually</label>
          {s.count.holes && (
            <div className="holegrid">
              {Array.from({ length: 18 }, (_, k) => (
                <label key={k}>H{k + 1} · P{pars[k] ?? ''}
                  <select value={s.count.holes[k] == null ? '' : String(s.count.holes[k])} onChange={(e) => { const h = s.count.holes.slice(); h[k] = num(e.target.value); setCount({ holes: h }); }}>
                    <option value="">Rule</option>{COUNT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
          <p className="note">Each hole uses its own setting first, then its par setting, then the every-hole setting.</p>
        </fieldset>
      )}

      {show('scramble', 'scramble_drive') && (
        <fieldset>
          <legend>Drives</legend>
          <label className="chk"><input type="checkbox" checked={s.drives !== false} onChange={(e) => set({ drives: e.target.checked })} /> Record whose drive was used</label>
          <label className="f" style={{ maxWidth: 220 }}>Minimum drives per player<input type="number" min="0" max="18" value={s.minDrives} onChange={(e) => set({ minDrives: Math.max(0, parseInt(e.target.value) || 0) })} /></label>
        </fieldset>
      )}

      <fieldset>
        <legend>Field &amp; divisions</legend>
        <label className="f" style={{ maxWidth: 380 }}>Who is in the field
          <select value={s.field} onChange={(e) => set({ field: e.target.value })}>
            <option value="open">Open field: men, ladies, juniors and seniors</option>
            <option value="men">Men only</option><option value="ladies">Ladies only</option><option value="juniors">Juniors only</option><option value="seniors">Seniors only</option>
          </select>
        </label>
        {show('stroke', 'stableford') && (
          <>
            <label className="chk"><input type="checkbox" checked={!!s.divisions} onChange={(e) => set({ divisions: e.target.checked })} /> Split the field into A, B and C divisions</label>
            {s.divisions && (
              <div className="grid2">
                <label className="f">Divide on<select value={s.divBy} onChange={(e) => set({ divBy: e.target.value })}><option value="playing">Playing handicap</option><option value="index">Handicap index (rounded)</option></select></label>
                {[['a', 'A division: 0 up to'], ['b', 'B division: up to'], ['c', 'C division: up to']].map(([k, l]) => (
                  <label key={k} className="f">{l}<input type="number" min="0" max="54" value={s.divLimits[k]} onChange={(e) => set({ divLimits: { ...s.divLimits, [k]: parseInt(e.target.value) || 0 } })} /></label>
                ))}
              </div>
            )}
            {s.divisions && <p className="note">Plus handicaps play in A. Anyone above the C limit is shown in a D division.</p>}
          </>
        )}
      </fieldset>

      <fieldset>
        <legend>Ties and checking</legend>
        <p className="note">Countback: 1. best back 9 · 2. best combined score on the holes below · 3. lowest handicap</p>
        <label className="f" style={{ maxWidth: 380 }}>Countback step 2 uses
          <select value={s.cb2} onChange={(e) => set({ cb2: e.target.value })}><option value="si">Odd stroke-index holes (SI 1, 3, 5 … 17)</option><option value="holes">Odd-numbered holes (1, 3, 5 … 17)</option></select>
        </label>
        <label className="f" style={{ maxWidth: 380 }}>When a player and marker disagree
          <select value={s.disputePolicy} onChange={(e) => set({ disputePolicy: e.target.value })}><option value="higher">Show the higher score until it's sorted out</option><option value="hold">Leave the hole off the leaderboard until it's sorted out</option></select>
        </label>
      </fieldset>
    </div>
  );
}
