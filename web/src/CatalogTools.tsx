import { useState } from 'react';

export function CatalogShare({url,title}: {url:string;title:string}) {
  const [fallback,setFallback]=useState(false),[status,setStatus]=useState('');
  async function share() {
    try {
      if(navigator.share) { await navigator.share({url,title});setStatus(''); }
      else { await navigator.clipboard.writeText(url);setStatus('Link copied.'); }
    } catch(reason) { if(reason instanceof DOMException && reason.name==='AbortError')return;setFallback(true);setStatus('Copy this link to share.'); }
  }
  return <div className="catalog-share"><button onClick={()=>{void share();}}>Share item</button><a href={`https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${url}`)}`} target="_blank" rel="noreferrer">Share on Bluesky</a> <a href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`}>Share by email</a>{status && <p role="status">{status}</p>}{fallback && <label>Item link<input readOnly value={url} onFocus={event=>event.currentTarget.select()}/></label>}</div>;
}
