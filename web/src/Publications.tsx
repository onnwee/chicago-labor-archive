import { useEffect, useState } from 'react';
import { catalogRequest, representationPath, type CatalogItem, type CatalogPage } from '@subcult/archive-viewer/catalog';
import type { Brand } from './brand';
import ChicagoHeader from './chicago/Header';
import { PUBLICATIONS, publicationHref } from './publications';

const number = new Intl.NumberFormat('en-US');
type Summary = { total: number; latest?: CatalogItem };

// One catalog request per publication gives its issue count and its latest issue, whose cover stands for the run.
function usePublicationSummaries(collection: string) {
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    for (const { name } of PUBLICATIONS) {
      const query = new URLSearchParams({ collection, media: 'print', creator: name, page: '1' });
      void catalogRequest<CatalogPage>(`/api/catalog/v1/items?${query}`, controller.signal)
        .then(page => { if (!controller.signal.aborted) setSummaries(current => ({ ...current, [name]: { total: page.total, latest: page.items.find(item => item.creator === name) } })); })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    }
    return () => controller.abort();
  }, [collection]);
  return { summaries, failed };
}

function coverURL(item: CatalogItem, collection: string): string | undefined {
  const representation = item.representations.find(value => value.media === 'print' && value.collections.includes(collection));
  return representation && `${representationPath(item, representation)}/cover?${new URLSearchParams({ collection })}`;
}

export default function Publications({ brand }: { brand: Brand }) {
  const collection = brand.collection;
  const { summaries, failed } = usePublicationSummaries(collection);
  useEffect(() => { document.title = `Publications — ${brand.title}`; }, [brand]);
  return <main className="mixed-archive facsimile-archive publications-page"><a className="skip-link" href="#publications">Skip to the publications</a>
    <ChicagoHeader brand={brand} home={false} />
    <section className="catalog-intro publications-intro"><div><p className="eyebrow">{brand.kicker}</p><h1>Publications</h1>
      <p>Each newspaper and magazine in the archive, with the years its dated issues cover. Open one to browse its issues in the catalog.</p></div></section>
    {failed && <p role="alert">Some issue counts could not be loaded. The links still open each publication in the catalog.</p>}
    <ul id="publications" className="publication-list">
      {PUBLICATIONS.map(publication => {
        const summary = summaries[publication.name];
        const cover = summary?.latest && coverURL(summary.latest, collection);
        return <li key={publication.name}>
          <a href={publicationHref(publication.name)}>
            <span className="publication-cover">{cover ? <img src={cover} alt="" loading="lazy" decoding="async" /> : null}</span>
            <span className="publication-name">{publication.name}</span>
          </a>
          <p className="publication-facts">
            {publication.years && <span>{publication.years}</span>}
            <span>{summary ? `${number.format(summary.total)} ${summary.total === 1 ? 'issue' : 'issues'}` : failed ? 'Issue count unavailable' : 'Counting issues…'}</span>
          </p>
        </li>;
      })}
    </ul>
    <footer><span>{brand.title}</span><span>Source metadata retained · Access reviewed per collection</span><a href="https://subcult.tv/support">Support SUBCULT’s archive software</a></footer>
  </main>;
}
