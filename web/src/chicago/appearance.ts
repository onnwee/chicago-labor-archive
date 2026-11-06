export type Mode = 'system' | 'light' | 'dark';
export type Theme = Exclude<Mode, 'system'>;
export type Appearance = { mode: Mode; accent: string };
export const STORAGE_KEY = 'chicago-labor-archive.appearance.v1';
export const DEFAULT_APPEARANCE: Appearance = { mode: 'system', accent: '#284fc7' };
export const ACCENTS = [
  { name: 'Archive blue', color: '#284fc7' },
  { name: 'Labor red', color: '#a62c2b' },
  { name: 'Lake teal', color: '#00736e' },
  { name: 'Violet', color: '#7153ad' },
  { name: 'Graphite', color: '#525252' },
];
export const PALETTES = {
  light: { background: '#ffffff', surface: '#eeeeec', ink: '#111111', muted: '#575757', border: '#929292' },
  dark: { background: '#181b1d', surface: '#2b3033', ink: '#f3f3ed', muted: '#bec5c7', border: '#8b959a' },
};

export function isHex(value: string): boolean { return /^#[0-9a-f]{6}$/i.test(value); }

export function parseAppearance(value: string | null): Appearance {
  try {
    const parsed: unknown = JSON.parse(value || 'null');
    if (parsed && typeof parsed === 'object' && 'mode' in parsed && 'accent' in parsed &&
      ['system', 'light', 'dark'].includes(String(parsed.mode)) && typeof parsed.accent === 'string' && isHex(parsed.accent)) {
      return { mode: parsed.mode as Mode, accent: parsed.accent.toLowerCase() };
    }
  } catch { /* Invalid or unavailable storage uses the default appearance. */ }
  return { ...DEFAULT_APPEARANCE };
}

function channels(hex: string): number[] {
  return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
}
function luminance(hex: string): number {
  return channels(hex).map(channel => {
    const value = channel / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}
export function contrast(first: string, second: string): number {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

// Keep the chosen hue, adjusting toward black/white only as far as necessary
// for ordinary text and focus rings on both interface surfaces. Scans are untouched.
export function accessibleAccent(seed: string, theme: Theme): string {
  const color = isHex(seed) ? seed.toLowerCase() : DEFAULT_APPEARANCE.accent;
  if (color === DEFAULT_APPEARANCE.accent && theme === 'dark') return '#9ac4ff';
  const palette = PALETTES[theme], target = theme === 'dark' ? 255 : 0;
  const input = channels(color);
  for (let step = 0; step <= 100; step++) {
    const candidate = '#' + input.map(channel => Math.round(channel + (target - channel) * step / 100).toString(16).padStart(2, '0')).join('');
    if ([palette.background, palette.surface].every(surface => contrast(candidate, surface) >= 4.5)) return candidate;
  }
  return palette.ink;
}
