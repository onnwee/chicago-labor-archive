import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useCatalog, catalogRequest, representationPath, representationURL, sourceProvider, type CatalogCollection, type CatalogItem, type CatalogRepresentation, type RepresentationTransport } from '@subcult/archive-viewer/catalog';
import type { Brand } from './brand';
import { CatalogShare } from './CatalogTools';
import ChicagoHeader from './chicago/Header';
import { invertedRange, readState, writeState, type ArchiveState } from './urlState';
const DocumentView = lazy(() => import('./DocumentView'));

const PAGE_SIZE = 24;
const number = new Intl.NumberFormat('en-US');
type Selection = { item: CatalogItem; representation: CatalogRepresentation };

function SelectedItem({ selection, collection, collectionTitle, onClose, focus, onFocus, readerPage, onReaderPage }: {
  selection: Selection; collection: string; collectionTitle: string; onClose: () => void; focus: boolean; onFocus: () => void;
  readerPage?: number; onReaderPage: (page: number) => void;
}) {
  const { item, representation } = selection;
  const path = representationPath(item, representation);
  const [asset, setAsset] = useState<RepresentationTransport>();
  const [download, setDownload] = useState<string>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const section = useRef<HTMLElement>(null);
  useEffect(() => { section.current?.scrollIntoView({ block: 'start' }); section.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void catalogRequest<RepresentationTransport>(`${path}/resolve?${new URLSearchParams({ collection, action: 'download' })}`, controller.signal)
      .then(value => { if (!controller.signal.aborted) setDownload(representationURL(value, 'download')); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [path, collection]);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (representation.media !== 'print' || !/\.pdf$/i.test(representation.file)) throw new Error('This reader supports PDF files. Open the source page for this format.');
      const resolved = await catalogRequest<RepresentationTransport>(`${path}/resolve?${new URLSearchParams({ collection })}`, controller.signal);
      if (resolved.media !== 'print') throw new Error('The document format has changed.');
      representationURL(resolved);
      if (!controller.signal.aborted) setAsset(resolved);
    })().catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'This document is unavailable.'); });
    return () => controller.abort();
  }, [path, collection, representation, attempt]);
  const share = writeState(location.href, { query: '', creator: '', dateFrom: '', dateTo: '', page: 1, item: item.id, representation: representation.id });
  const provider = asset ? sourceProvider(asset) : '';
  return <section ref={section} tabIndex={-1} className="catalog-selection" aria-label="Selected document">
    <button onClick={onClose}>Close document</button><button aria-pressed={focus} onClick={onFocus}>{focus ? 'Exit focus mode' : 'Focus mode'}</button>
    <p className="eyebrow">Print · {collectionTitle}</p><h2>{item.title}</h2>
    <CatalogShare url={share} title={item.title} />
    <p>{[item.creator, item.date].filter(Boolean).join(' · ')}</p>{item.description && <p>{item.description}</p>}
    <dl>{representation.extension.print && <><dt>Pages</dt><dd>{representation.extension.print.pages || 'Unknown'}</dd><dt>Edition</dt><dd>{representation.extension.print.variant || 'Unknown'}</dd></>}<dt>File</dt><dd>{representation.file}</dd></dl>
    {!error && !asset && <p role="status">Checking access…</p>}
    {error && <p role="alert">{error} <button onClick={() => { setError(''); setAsset(undefined); setAttempt(value => value + 1); }}>Try again</button></p>}
    {asset && <Suspense fallback={<p role="status">Opening PDF reader…</p>}><DocumentView url={asset.url} title={item.title} path={path} collection={collection} initialPage={readerPage} onPageChange={onReaderPage} /></Suspense>}
    {download && <p><a href={download} download={representation.file}>Download original PDF</a></p>}
    {asset && <p><a href={asset.source_url} target="_blank" rel="noreferrer">{provider === 'archive.org' ? 'Source item at Internet Archive' : `Source page at ${provider}`}</a></p>}
  </section>;
}

export default function Archive({ brand }: { brand: Brand }) {
  const collection = brand.collection;
  const [state, setState] = useState<ArchiveState>(() => readState(typeof window === 'undefined' ? '' : location.search));
  const [selection, setSelection] = useState<Selection>();
  const [collectionTitle, setCollectionTitle] = useState(brand.title);
  const [focus, setFocus] = useState(false);
  const [jump, setJump] = useState('');
  const opener = useRef<HTMLElement | null>(null);
  const catalogHeading = useRef<HTMLHeadingElement>(null);
  const inverted = invertedRange(state);
  const catalog = useCatalog({ collection, media: 'print', query: state.query, page: state.page, creator: state.creator, dateFrom: inverted ? '' : state.dateFrom, dateTo: inverted ? '' : state.dateTo });
  const pages = catalog.page ? Math.max(1, Math.ceil(catalog.page.total / PAGE_SIZE)) : 1;

  const update = useCallback((next: Partial<ArchiveState>, push = false) => {
    setState(current => {
      const merged = { ...current, ...next };
      history[push ? 'pushState' : 'replaceState'](null, '', writeState(location.href, merged));
      return merged;
    });
  }, []);

  useEffect(() => {
    const restore = () => setState(readState(location.search));
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  useEffect(() => {
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') setFocus(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  useEffect(() => { document.title = `${brand.title} — ${brand.headline}`; }, [brand]);
  useEffect(() => {
    const controller = new AbortController();
    void catalogRequest<CatalogCollection[]>('/api/catalog/v1/collections', controller.signal)
      .then(value => { const match = value.find(c => c.id === collection); if (!controller.signal.aborted && match && match.title !== match.id) setCollectionTitle(match.title); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [collection]);
  // Open the document named in the URL, including after reload or back/forward.
  useEffect(() => {
    if (!state.item || !state.representation) { setSelection(undefined); setFocus(false); return; }
    if (selection?.item.id === state.item && selection.representation.id === state.representation) return;
    const controller = new AbortController();
    void catalogRequest<CatalogItem>(`/api/catalog/v1/items/${encodeURIComponent(state.item)}?${new URLSearchParams({ collection })}`, controller.signal).then(item => {
      const representation = item.representations.find(value => value.id === state.representation && value.collections.includes(collection));
      if (!controller.signal.aborted && representation) setSelection({ item, representation });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [state.item, state.representation, collection, selection]);

  function open(item: CatalogItem, representation: CatalogRepresentation, button: HTMLElement) {
    opener.current = button;
    setSelection({ item, representation });
    update({ item: item.id, representation: representation.id, readerPage: undefined }, true);
  }
  function close() {
    setSelection(undefined); setFocus(false);
    update({ item: undefined, representation: undefined, readerPage: undefined }, true);
    // Return keyboard focus to the control that opened the document.
    requestAnimationFrame(() => {
      const target = opener.current?.isConnected ? opener.current : catalogHeading.current;
      target?.focus(); target?.scrollIntoView({ block: 'center' });
    });
  }
  function filter(next: Partial<ArchiveState>) {
    setSelection(undefined);
    update({ ...next, page: 1, item: undefined, representation: undefined, readerPage: undefined });
  }
  function goTo(page: number) {
    update({ page: Math.min(Math.max(1, page), pages), item: undefined, representation: undefined, readerPage: undefined }, true);
    setSelection(undefined);
    catalogHeading.current?.focus();
    catalogHeading.current?.scrollIntoView({ block: 'start' });
  }
  function submitJump(event: FormEvent) {
    event.preventDefault();
    const target = Number(jump);
    if (Number.isInteger(target) && target >= 1) goTo(target);
  }
  const readButtons = (item: CatalogItem) => item.representations.filter(rep => rep.media === 'print' && rep.collections.includes(collection)).map(rep =>
    <button key={rep.id} onClick={event => open(item, rep, event.currentTarget)}>Read{item.representations.length > 1 ? ` · ${rep.extension.print?.variant || rep.file}` : ''}<span className="visually-hidden">: {item.title}</span></button>);

  return <main className={`mixed-archive facsimile-archive${focus && selection ? ' reading-focus' : ''}`}><a className="skip-link" href="#catalog">Skip to the catalog</a>
    <ChicagoHeader brand={brand} />
    <section className="catalog-intro"><div><p className="eyebrow">{brand.kicker}</p><h1>{brand.headline}</h1><p>{brand.description}</p></div>
      <aside aria-label="Geographic scope"><p>Chicago, its suburbs <br />and the Calumet region.</p><a href="#catalog">Find an issue below</a></aside></section>
    <section id="catalog" aria-labelledby="catalog-heading">
      <h2 id="catalog-heading" ref={catalogHeading} tabIndex={-1} className="visually-hidden">Catalog</h2>
      <div className="catalog-filters">
        <label>Search titles and descriptions<input type="search" value={state.query} maxLength={200} onChange={event => filter({ query: event.target.value })} /></label>
        <label>Publication<input value={state.creator} maxLength={200} onChange={event => filter({ creator: event.target.value })} /></label>
        <label>Original date from<input type="date" value={state.dateFrom} onChange={event => filter({ dateFrom: event.target.value })} /></label>
        <label>Original date to<input type="date" value={state.dateTo} onChange={event => filter({ dateTo: event.target.value })} /></label></div>
      <p className="catalog-date-note">Date filters match complete original dates. Issues with a partial or unknown date appear only when both date fields are empty.</p>
      {inverted ? <p role="alert">The start date is after the end date. Swap them to see results.</p> : <>
        {catalog.pending && <p role="status">Loading catalog…</p>}{catalog.error && <p role="alert">{catalog.error} <button onClick={catalog.retry}>Try again</button></p>}
        {catalog.page && <><p role="status">{number.format(catalog.page.total)} {catalog.page.total === 1 ? 'document' : 'documents'} · Search covers titles and descriptions</p>{catalog.page.items.length === 0 && <p>No documents match these filters.</p>}
          <div className="catalog-table-wrap"><table><caption>Archive catalog, page {number.format(state.page)} of {number.format(pages)}</caption><thead><tr><th scope="col">Document</th><th scope="col">Original date</th><th scope="col">Publication</th><th scope="col">Actions</th></tr></thead>
            <tbody>{catalog.page.items.map(item => <tr key={item.id}><th scope="row">{item.title}</th><td data-label="Original date">{item.date || 'Unknown'}</td><td data-label="Publication">{item.creator || 'Unknown'}</td><td data-label="Actions">{readButtons(item)}</td></tr>)}</tbody></table></div>
          <nav className="catalog-pages" aria-label="Catalog pages"><button disabled={state.page <= 1} onClick={() => goTo(state.page - 1)}>Previous</button><span>Page {number.format(state.page)} of {number.format(pages)}</span><button disabled={state.page >= pages} onClick={() => goTo(state.page + 1)}>Next</button>
            {pages > 2 && <form onSubmit={submitJump}><label>Go to page<input type="number" inputMode="numeric" min={1} max={pages} value={jump} onChange={event => setJump(event.target.value)} /></label><button type="submit">Go</button></form>}</nav></>}
      </>}
    </section>
    {selection && <SelectedItem key={`${selection.item.id}:${selection.representation.id}`} selection={selection} collection={collection} collectionTitle={collectionTitle} onClose={close} focus={focus} onFocus={() => setFocus(!focus)} readerPage={state.readerPage} onReaderPage={page => update({ readerPage: page })} />}
    <section id="archive-about" className="archive-about"><h2>A regional record, in its own words.</h2><p>Periodicals and documents published in Chicago, its suburbs and the Calumet region in northwest Indiana. Original dates and source information stay with each document. Catalog search covers titles and descriptions; text search is available inside a document when its text has been indexed.</p></section>
    <footer><span>{brand.title}</span><span>Source metadata retained · Access reviewed per collection</span><a href="https://subcult.tv/support">Support SUBCULT’s archive software</a></footer>
  </main>;
}
