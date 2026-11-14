import { PrintReader, type PrintHit } from '@subcult/archive-viewer/print';
import { catalogRequest } from '@subcult/archive-viewer/catalog';
import { pdfBackend } from './pdfBackend';

// Page arrows, a whole-page fit, full screen and one "Search & text" panel; the text status sits in the record beside the reader.
export default function DocumentView({url,title,path,collection,searchable,initialPage,onPageChange}: {url:string;title:string;path:string;collection:string;searchable:boolean;initialPage?:number;onPageChange?:(page:number)=>void}) {
  return <PrintReader url={url} title={title} backend={pdfBackend} initialPage={initialPage} onPageChange={onPageChange} pageArrows fitPage fullscreen searchToggle
    search={searchable ? (query,signal) => catalogRequest<PrintHit[]>(`${path}/search?${new URLSearchParams({collection,q:query})}`,signal) : undefined} />;
}
