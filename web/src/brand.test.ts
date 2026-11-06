import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { checkEngine, parseBrand } from './brand';

const site = JSON.parse(readFileSync(new URL('../public/brand/chicago-labor-archive/site.json', import.meta.url), 'utf8'));

test('the shipped site configuration is valid', () => {
  const brand = parseBrand(site);
  expect(brand.collection).toBe('chicago-labor-archive');
});

test('the engine must serve the print catalog for this collection', () => {
  const brand = parseBrand(site);
  const modules = { catalog: '1', print: '1' };
  expect(() => checkEngine(brand, { api_version: '1', collection: '', collections: ['chicago-labor-archive'], modules })).not.toThrow();
  expect(() => checkEngine(brand, { api_version: '1', collection: '', collections: ['other'], modules })).toThrow(/not configured/);
  expect(() => checkEngine(brand, { api_version: '1', collection: '', modules: { catalog: '1' } })).toThrow(/print catalog/);
  expect(() => parseBrand({ ...site, logo: '//evil.invalid/x.svg' })).toThrow();
  expect(() => parseBrand({ ...site, interface: 'video' })).toThrow();
});
