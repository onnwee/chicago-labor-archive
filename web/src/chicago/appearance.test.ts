import { expect, test } from 'vitest';
import { ACCENTS, DEFAULT_APPEARANCE, PALETTES, accessibleAccent, contrast, parseAppearance } from './appearance';

test('appearance storage accepts bounded preferences and recovers from invalid or old data', () => {
  expect(parseAppearance('{"mode":"dark","accent":"#ABCDEF"}')).toEqual({ mode:'dark', accent:'#abcdef' });
  for (const value of [null, '', '{', 'null', '[]', '{}', '{"mode":"sepia","accent":"#284fc7"}', '{"mode":"dark","accent":"red;display:none"}', '{"mode":"dark","accent":"#fff"}']) {
    expect(parseAppearance(value)).toEqual(DEFAULT_APPEARANCE);
  }
});

test('approved default colors remain exact in both modes', () => {
  expect(accessibleAccent('#284fc7', 'light')).toBe('#284fc7');
  expect(accessibleAccent('#284fc7', 'dark')).toBe('#9ac4ff');
  expect(accessibleAccent('invalid', 'dark')).toBe('#9ac4ff');
});

test('presets and custom colors support normal text and keyboard focus on both surfaces', () => {
  const colors = [...ACCENTS.map(preset => preset.color), '#ffffff', '#000000', '#ffff00', '#00ff00'];
  for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) {
    colors.push('#' + [r,g,b].map(value => value.toString(16).padStart(2,'0')).join(''));
  }
  for (const theme of ['light', 'dark'] as const) for (const seed of colors) {
    const color = accessibleAccent(seed, theme);
    for (const surface of [PALETTES[theme].background, PALETTES[theme].surface]) {
      expect(contrast(color, surface), `${seed} → ${color} on ${theme} ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  }
});
