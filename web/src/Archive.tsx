import { lazy, Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useCatalog, catalogRequest, catalogLabelsURL, representationPath, representationURL, sourceProvider, type CatalogItem, type CatalogLabel, type CatalogRepresentation, type RepresentationTransport } from '@subcult/archive-viewer/catalog';
import type { Brand } from './brand';
import { CatalogShare } from './CatalogTools';
import ChicagoHeader from './chicago/Header';
import { PUBLICATIONS } from './publications';
import { invertedRange, readState, writeState, type ArchiveState } from './urlState';
const DocumentView = lazy(() => import('./DocumentView'));

const PAGE_SIZE = 24;
const KIND_NAMES: Record<string, string> = { topic: 'Topics', place: 'Places', organization: 'Organizations', person: 'People', event: 'Events' };
const number = new Intl.NumberFormat('en-US');
type Selection = { item: CatalogItem; representation: CatalogRepresentation };

type PrintIndex = { pages?: number; text_status?: string };
const TEXT_STATUS: Record<string, string> = {
  'page-text': 'Page text searchable',
  'document-text': 'Document text searchable; page mapping unavailable',
};

// The document view: the reader first, its record beside it on wide screens and under it on narrow ones.
function SelectedItem({ selection, collection, onClose, readerPage, onReaderPage }: {
  selection: Selection; collection: string; onClose: () => void;
  readerPage?: number; onReaderPage: (page: number) => void;
}) {
  const { item, representation } = selection;
  const path = representationPath(item, representation);
  const [asset, setAsset] = useState<RepresentationTransport>();
  const [download, setDownload] = useState<string>();
  const [index, setIndex] = useState<PrintIndex>({});
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const section = useRef<HTMLElement>(null);
  useEffect(() => { window.scrollTo({ top: 0 }); section.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void catalogRequest<RepresentationTransport>(`${path}/resolve?${new URLSearchParams({ collection, action: 'download' })}`, controller.signal)
      .then(value => { if (!controller.signal.aborted) setDownload(representationURL(value, 'download')); })
      .catch(() => undefined);
    void catalogRequest<PrintIndex>(`${path}/print?${new URLSearchParams({ collection })}`, controller.signal)
      .then(value => { if (!controller.signal.aborted) setIndex(value); })
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
  const pages = index.pages || representation.extension.print?.pages;
  const searchable = index.text_status === 'page-text' || index.text_status === 'document-text';
  return <section ref={section} tabIndex={-1} className="catalog-selection document" aria-labelledby="document-title">
    <nav className="document-crumbs" aria-label="Breadcrumb"><button className="link-button" onClick={onClose}><span aria-hidden="true">← </span>Back to the catalog</button>
      {item.creator && <> · <a href={`/?${new URLSearchParams({ creator: item.creator })}#catalog`}>{item.creator}</a></>}</nav>
    <div className="document-body">
      <div className="document-main">
        <header className="document-header"><h1 id="document-title">{item.title}</h1>
          <p className="byline">{item.creator && <span>{item.creator}</span>}<span>{item.date || 'Date unknown'}</span>{pages ? <span>{pages} pages</span> : null}</p></header>
        {!error && !asset && <p role="status">Checking access…</p>}
        {error && <p role="alert">{error} <button onClick={() => { setError(''); setAsset(undefined); setAttempt(value => value + 1); }}>Try again</button></p>}
        {asset && <div className="document-reader"><Suspense fallback={<p role="status">Opening PDF reader…</p>}><DocumentView url={asset.url} title={item.title} path={path} collection={collection} searchable={searchable} initialPage={readerPage} onPageChange={onReaderPage} /></Suspense></div>}
      </div>
      <aside className="document-details" aria-label="About this document">
        <div className="document-actions">
          {download && <a className="button download" href={download} download={representation.file}>Download PDF</a>}
          <CatalogShare url={share} title={item.title} />
        </div>
        {item.description && <p className="document-description">{item.description}</p>}
        {item.labels && item.labels.length > 0 && <section><h2>Topics and tags</h2><ul className="document-labels">{item.labels.map(label => <li key={label.id}><span className="visually-hidden">{label.kind}: </span>{label.label}</li>)}</ul></section>}
        <section><h2>Source</h2>
          {asset && <p><a href={asset.source_url} target="_blank" rel="noreferrer">{provider === 'archive.org' ? 'Source item at Internet Archive' : `Source page at ${provider}`}</a></p>}
          <dl>{representation.extension.print && <><dt>Edition</dt><dd>{representation.extension.print.variant || 'Unknown'}</dd></>}<dt>File</dt><dd>{representation.file}</dd>
            <dt>Text</dt><dd>{TEXT_STATUS[index.text_status || ''] || (index.text_status ? 'Text search unavailable' : 'Checking…')}</dd></dl>
        </section>
      </aside>
    </div>
  </section>;
}

export default function Archive({ brand }: { brand: Brand }) {
  const collection = brand.collection;
  const [state, setState] = useState<ArchiveState>(() => readState(typeof window === 'undefined' ? '' : location.search));
  const [selection, setSelection] = useState<Selection>();
  const [jump, setJump] = useState('');
  const [labels, setLabels] = useState<CatalogLabel[]>([]);
  const [opens, setOpens] = useState(0);
  const opener = useRef<HTMLElement | null>(null);
  const catalogHeading = useRef<HTMLHeadingElement>(null);
  const inverted = invertedRange(state);
  const catalog = useCatalog({ collection, media: 'print', query: state.query, page: state.page, creator: state.creator, dateFrom: inverted ? '' : state.dateFrom, dateTo: inverted ? '' : state.dateTo, text: state.text, label: state.label });
  const textSearch = Boolean(state.text?.trim());
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
  useEffect(() => { document.title = `${brand.title} — ${brand.headline}`; }, [brand]);
  // A link such as /?creator=…#catalog lands on the catalog once its first page has rendered.
  const arrived = useRef(false);
  useEffect(() => {
    if (!catalog.page || arrived.current) return;
    arrived.current = true;
    if (location.hash === '#catalog' && !state.item) document.getElementById('catalog')?.scrollIntoView({ block: 'start' });
  }, [catalog.page, state.item]);
  useEffect(() => {
    const controller = new AbortController();
    void catalogRequest<CatalogLabel[]>(catalogLabelsURL(collection), controller.signal)
      .then(value => { if (!controller.signal.aborted) setLabels(value); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [collection]);
  // Open the document named in the URL, including after reload or back/forward.
  useEffect(() => {
    if (!state.item || !state.representation) { setSelection(undefined); return; }
    if (selection?.item.id === state.item && selection.representation.id === state.representation) return;
    const controller = new AbortController();
    void catalogRequest<CatalogItem>(`/api/catalog/v1/items/${encodeURIComponent(state.item)}?${new URLSearchParams({ collection })}`, controller.signal).then(item => {
      const representation = item.representations.find(value => value.id === state.representation && value.collections.includes(collection));
      if (!controller.signal.aborted && representation) setSelection({ item, representation });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [state.item, state.representation, collection, selection]);

  function open(item: CatalogItem, representation: CatalogRepresentation, button: HTMLElement, page?: number) {
    opener.current = button;
    setOpens(n => n + 1); // remount the reader so a requested page always applies
    setSelection({ item, representation });
    update({ item: item.id, representation: representation.id, readerPage: page }, true);
  }
  function close() {
    setSelection(undefined);
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
  const hitButtons = (item: CatalogItem) => (item.text_hits || []).map(hit => {
    const representation = item.representations.find(rep => rep.id === hit.representation);
    return representation && <li key={`${hit.representation}:${hit.page}`}><span className="hit-snippet">…{hit.snippet}…</span> <button onClick={event => open(item, representation, event.currentTarget, hit.page || undefined)}>{hit.page ? `Read page ${hit.page}` : 'Read'}<span className="visually-hidden">: {item.title}</span></button></li>;
  });
  const grouped = Object.entries(labels.reduce<Record<string, CatalogLabel[]>>((groups, label) => { (groups[label.kind] ||= []).push(label); return groups; }, {}));
  const readButtons = (item: CatalogItem) => item.representations.filter(rep => rep.media === 'print' && rep.collections.includes(collection)).map(rep =>
    <button key={rep.id} onClick={event => open(item, rep, event.currentTarget)}>Read{item.representations.length > 1 ? ` · ${rep.extension.print?.variant || rep.file}` : ''}<span className="visually-hidden">: {item.title}</span></button>);

  return <main className={`mixed-archive facsimile-archive${selection ? ' document-open' : ''}`}><a className="skip-link" href="#catalog">Skip to the catalog</a>
    <ChicagoHeader brand={brand} />
    <section className="catalog-intro"><div><p className="eyebrow">{brand.kicker}</p><h1>{brand.headline}</h1><p>{brand.description}</p></div>
      <aside aria-label="Geographic scope"><p>Chicago, its suburbs <br />and the Calumet region.</p><a href="#catalog">Find an issue below</a></aside></section>
    <section id="catalog" aria-labelledby="catalog-heading">
      <h2 id="catalog-heading" ref={catalogHeading} tabIndex={-1} className="visually-hidden">Catalog</h2>
      <div className="catalog-filters">
        <label>Search titles and descriptions<input type="search" value={state.query} maxLength={200} onChange={event => filter({ query: event.target.value })} /></label>
        <label>Search document text<input type="search" value={state.text || ''} maxLength={200} onChange={event => filter({ text: event.target.value || undefined })} /></label>
        {labels.length > 0 && <label>Topic or tag<select value={state.label || ''} onChange={event => filter({ label: event.target.value || undefined })}><option value="">Any</option>{grouped.map(([kind, group]) => <optgroup key={kind} label={KIND_NAMES[kind] || kind}>{group.map(label => <option key={label.id} value={label.id}>{label.label} ({number.format(label.items)})</option>)}</optgroup>)}</select></label>}
        <label>Publication<select value={state.creator} onChange={event => filter({ creator: event.target.value })}><option value="">Any</option>{PUBLICATIONS.map(publication => <option key={publication.name} value={publication.name}>{publication.name}</option>)}{state.creator && !PUBLICATIONS.some(publication => publication.name === state.creator) && <option value={state.creator}>{state.creator}</option>}</select></label>
        <label>Original date from<input type="date" value={state.dateFrom} onChange={event => filter({ dateFrom: event.target.value })} /></label>
        <label>Original date to<input type="date" value={state.dateTo} onChange={event => filter({ dateTo: event.target.value })} /></label></div>
      <p className="catalog-date-note">Date filters match complete original dates. Issues with a partial or unknown date appear only when both date fields are empty.</p>
      {inverted ? <p role="alert">The start date is after the end date. Swap them to see results.</p> : <>
        {catalog.pending && <p role="status">Loading catalog…</p>}{catalog.error && <p role="alert">{catalog.error} <button onClick={catalog.retry}>Try again</button></p>}
        {catalog.page && <><p role="status">{number.format(catalog.page.total)} {catalog.page.total === 1 ? 'document' : 'documents'} · {textSearch ? 'Document text searched where it has been indexed; scans still waiting for text recognition are not included' : 'Search covers titles and descriptions'}</p>{catalog.page.items.length === 0 && <p>No documents match these filters.</p>}
          <div className="catalog-table-wrap"><table><caption>Archive catalog, page {number.format(state.page)} of {number.format(pages)}</caption><thead><tr><th scope="col">Document</th><th scope="col">Original date</th><th scope="col">Publication</th><th scope="col">Actions</th></tr></thead>
            <tbody>{catalog.page.items.map(item => <tr key={item.id}><th scope="row">{item.title}{textSearch && item.text_hits && item.text_hits.length > 0 && <ul className="text-hits" aria-label="Matching pages">{hitButtons(item)}</ul>}</th><td data-label="Original date">{item.date || 'Unknown'}</td><td data-label="Publication">{item.creator || 'Unknown'}</td><td data-label="Actions">{readButtons(item)}</td></tr>)}</tbody></table></div>
          <nav className="catalog-pages" aria-label="Catalog pages"><button disabled={state.page <= 1} onClick={() => goTo(state.page - 1)}>Previous</button><span>Page {number.format(state.page)} of {number.format(pages)}</span><button disabled={state.page >= pages} onClick={() => goTo(state.page + 1)}>Next</button>
            {pages > 2 && <form onSubmit={submitJump}><label>Go to page<input type="number" inputMode="numeric" min={1} max={pages} value={jump} onChange={event => setJump(event.target.value)} /></label><button type="submit">Go</button></form>}</nav></>}
      </>}
    </section>
    {selection && <SelectedItem key={`${selection.item.id}:${selection.representation.id}:${opens}`} selection={selection} collection={collection} onClose={close} readerPage={state.readerPage} onReaderPage={page => update({ readerPage: page })} />}
    <section id="archive-about" className="archive-about"><h2>A regional record, in its own words.</h2><p>Periodicals and documents published in Chicago, its suburbs and the Calumet region in northwest Indiana. Original dates and source information stay with each document. Catalog search covers titles and descriptions; text search is available inside a document when its text has been indexed.</p></section>
    <footer><span>{brand.title}</span><span>Source metadata retained · Access reviewed per collection</span><a href="https://subcult.tv/support">Support SUBCULT’s archive software</a></footer>
  </main>;
}
