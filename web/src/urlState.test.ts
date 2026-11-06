import { expect, test } from 'vitest';
import { invertedRange, readState, writeState } from './urlState';

test('catalog, item and reader page round-trip through the URL', () => {
  const state = { query: 'strike', creator: 'Proletarec', dateFrom: '1909-01-01', dateTo: '1909-12-31', page: 40, item: 'mia-0123', representation: 'pdf', readerPage: 4 };
  const url = writeState('https://cla.subcult.tv/?collection=other#catalog', state);
  expect(new URL(url).searchParams.get('collection')).toBeNull();
  expect(new URL(url).hash).toBe('');
  expect(readState(new URL(url).search)).toEqual(state);
});

test('defaults stay out of the URL and invalid values are ignored', () => {
  expect(writeState('https://cla.subcult.tv/', { query: '', creator: '', dateFrom: '', dateTo: '', page: 1 })).toBe('https://cla.subcult.tv/');
  expect(readState('?page=0&from=1909&to=x&item=../x&representation=pdf&p=2')).toEqual({ query: '', creator: '', dateFrom: '', dateTo: '', page: 1, item: undefined, representation: undefined, readerPage: undefined });
  expect(readState('?page=9999999').page).toBe(1);
  expect(readState('?item=a&p=3').readerPage).toBeUndefined();
});

test('an inverted date range is detected before it reaches the engine', () => {
  expect(invertedRange({ dateFrom: '1912-01-01', dateTo: '1909-01-01' })).toBe(true);
  expect(invertedRange({ dateFrom: '1909-01-01', dateTo: '1912-01-01' })).toBe(false);
  expect(invertedRange({ dateFrom: '', dateTo: '1909-01-01' })).toBe(false);
});
