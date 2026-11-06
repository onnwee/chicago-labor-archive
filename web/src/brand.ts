export type Brand = {
  interface: 'catalog';
  presentation: 'facsimile-index';
  title: string; subtitle: string; collection: string; kicker: string;
  headline: string; description: string; logo: string;
  colors: { background: string; surface: string; ink: string; muted: string; accent: string; border: string };
};
export type EngineCapabilities = { api_version: string; collection: string; collections?: string[]; modules?: Record<string, string> };

export function checkEngine(brand: Brand, engine: EngineCapabilities): void {
  if (engine.api_version !== '1') throw new Error('This engine version is not supported.');
  if (['catalog', 'print'].some(module => engine.modules?.[module] !== '1')) throw new Error('This engine does not support the print catalog.');
  if (engine.collection && engine.collection !== brand.collection || engine.collections && !engine.collections.includes(brand.collection)) throw new Error('This archive is not configured for this collection.');
}

export function parseBrand(input: unknown): Brand {
  if (!input || typeof input !== 'object') throw new Error('Site configuration is missing.');
  const value = input as Brand;
  if (value.interface !== 'catalog' || value.presentation !== 'facsimile-index') throw new Error('Invalid site interface.');
  for (const key of ['title', 'subtitle', 'collection', 'kicker', 'headline', 'description'] as const) {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 1000) throw new Error(`Invalid site ${key}.`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value.collection)) throw new Error('Invalid site collection.');
  for (const key of ['background', 'surface', 'ink', 'muted', 'accent', 'border'] as const) {
    if (!/^#[0-9a-fA-F]{6}$/.test(value.colors?.[key] || '')) throw new Error(`Invalid site color ${key}.`);
  }
  if (typeof value.logo !== 'string' || !/^\/[A-Za-z0-9_./-]+$/.test(value.logo) || value.logo.startsWith('//') || value.logo.includes('..')) throw new Error('Logo must be a local asset path.');
  return value;
}
