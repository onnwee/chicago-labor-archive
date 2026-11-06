// Catalog filters, the open document and its reader page live in the URL so
// every view can be reloaded, shared and cited.
export type ArchiveState = {
  query: string; creator: string; dateFrom: string; dateTo: string; page: number;
  text?: string; label?: string;
  item?: string; representation?: string; readerPage?: number;
};

const id = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const day = /^\d{4}-\d{2}-\d{2}$/;
const KEYS = ['q', 'creator', 'from', 'to', 'page', 'item', 'representation', 'p', 'text', 'label'];
const labelId = /^[a-z0-9][a-z0-9._-]{0,99}$/;

function count(value: string | null, max: number): number | undefined {
  if (!value || !/^[1-9]\d{0,5}$/.test(value)) return undefined;
  const n = Number(value);
  return n <= max ? n : undefined;
}

export function readState(search: string): ArchiveState {
  const params = new URLSearchParams(search);
  const text = (key: string) => (params.get(key) || '').slice(0, 200);
  const item = params.get('item') || '', representation = params.get('representation') || '';
  const open = id.test(item) && id.test(representation);
  return {
    query: text('q'), creator: text('creator'),
    text: text('text') || undefined,
    label: labelId.test(params.get('label') || '') ? params.get('label')! : undefined,
    dateFrom: day.test(params.get('from') || '') ? params.get('from')! : '',
    dateTo: day.test(params.get('to') || '') ? params.get('to')! : '',
    page: count(params.get('page'), 100000) ?? 1,
    item: open ? item : undefined, representation: open ? representation : undefined,
    readerPage: open ? count(params.get('p'), 100000) : undefined,
  };
}

export function writeState(base: string, state: ArchiveState): string {
  const url = new URL(base);
  for (const key of KEYS) url.searchParams.delete(key);
  url.searchParams.delete('collection');
  const set = (key: string, value: string | number | undefined) => { if (value !== undefined && value !== '') url.searchParams.set(key, String(value)); };
  set('q', state.query); set('creator', state.creator); set('from', state.dateFrom); set('to', state.dateTo);
  set('text', state.text); set('label', state.label);
  if (state.page > 1) set('page', state.page);
  if (state.item && state.representation) {
    set('item', state.item); set('representation', state.representation);
    if (state.readerPage && state.readerPage > 1) set('p', state.readerPage);
  }
  url.hash = '';
  return url.toString();
}

export function invertedRange(state: Pick<ArchiveState, 'dateFrom' | 'dateTo'>): boolean {
  return Boolean(state.dateFrom && state.dateTo && state.dateFrom > state.dateTo);
}
