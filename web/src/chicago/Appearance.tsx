import { useEffect, useId, useState, type CSSProperties } from 'react';
import { ACCENTS, DEFAULT_APPEARANCE, PALETTES, STORAGE_KEY, accessibleAccent, isHex, parseAppearance, type Appearance as Preferences, type Mode } from './appearance';

function load(): Preferences {
  try { return parseAppearance(localStorage.getItem(STORAGE_KEY)); }
  catch { return { ...DEFAULT_APPEARANCE }; }
}

export default function Appearance() {
  const [preferences, setPreferences] = useState(load);
  const [systemDark, setSystemDark] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  const [hex, setHex] = useState(preferences.accent);
  const [error, setError] = useState('');
  const [storageBlocked, setStorageBlocked] = useState(false);
  const id = useId();
  const theme = preferences.mode === 'system' ? systemDark ? 'dark' : 'light' : preferences.mode;
  const accent = accessibleAccent(preferences.accent, theme);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    change();
    media.addEventListener('change', change);
    const storage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        const next = load(); setPreferences(next); setHex(next.accent); setError('');
      }
    };
    window.addEventListener('storage', storage);
    return () => { media.removeEventListener('change', change); window.removeEventListener('storage', storage); };
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.archiveDesign = 'facsimile-index';
    root.dataset.archiveTheme = theme;
    for (const [key, value] of Object.entries({ ...PALETTES[theme], accent })) root.style.setProperty(`--${key}`, value);
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', PALETTES[theme].background);
  }, [theme, accent]);
  function update(next: Preferences) {
    setPreferences(next); setHex(next.accent); setError('');
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); setStorageBlocked(false); }
    catch { setStorageBlocked(true); }
  }
  function applyHex() {
    if (!isHex(hex.trim())) { setError('Enter a six-digit hex color, such as #284fc7.'); return; }
    update({ ...preferences, accent: hex.trim().toLowerCase() });
  }
  return <details className="archive-appearance">
    <summary>Appearance <span className="appearance-current" aria-hidden="true" style={{ background: accent }} /></summary>
    <div className="appearance-panel">
      <label>Color mode<select value={preferences.mode} onChange={event => update({ ...preferences, mode: event.target.value as Mode })}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
      </select></label>
      <fieldset><legend>Focus &amp; accent color</legend><div className="accent-presets">
        {ACCENTS.map(preset => <button key={preset.color} type="button" className="accent-preset" aria-pressed={preferences.accent === preset.color}
          onClick={() => update({ ...preferences, accent: preset.color })}>
          <span aria-hidden="true" style={{ '--swatch': preset.color } as CSSProperties} />{preset.name}
        </button>)}
      </div></fieldset>
      <div className="custom-accent">
        <label>Custom color<input type="color" value={preferences.accent} onChange={event => update({ ...preferences, accent: event.target.value })} /></label>
        <form onSubmit={event => { event.preventDefault(); applyHex(); }}>
          <label htmlFor={`${id}-hex`}>Hex color</label><div className="hex-entry"><input id={`${id}-hex`} value={hex} maxLength={7} spellCheck={false} autoCapitalize="none" autoComplete="off"
            aria-invalid={!!error} aria-describedby={error ? `${id}-error` : `${id}-note`} onChange={event => { setHex(event.target.value); setError(''); }} />
            <button type="submit">Apply</button></div>
        </form>
        <button type="button" className="appearance-reset" onClick={() => update({ ...DEFAULT_APPEARANCE })}>Reset appearance</button>
      </div>
      {error && <p id={`${id}-error`} role="alert">{error}</p>}
      <p id={`${id}-note`} className="appearance-note">Links and keyboard focus use your color, adjusted for readable contrast in each mode. The mark and documents keep their original colors.</p>
      <p className="appearance-note" role="status">{storageBlocked ? 'Applied for this visit. Your browser could not save this preference.' : 'Saved in this browser.'} Active {theme} accent: <code>{accent.toUpperCase()}</code>.</p>
    </div>
  </details>;
}
