import { useEffect, useState } from 'react';
import { checkEngine, parseBrand, type Brand, type EngineCapabilities } from './brand';
import Archive from './Archive';
import './styles.css';

async function load<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('The archive is temporarily unavailable.');
  return await response.json() as T;
}

export default function App({ configPath = '/brand/chicago-labor-archive/site.json' }: { configPath?: string }) {
  const [brand, setBrand] = useState<Brand | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([load<unknown>(configPath, controller.signal), load<EngineCapabilities>('/api/version', controller.signal)]).then(([config, engine]) => {
      const parsed = parseBrand(config);
      checkEngine(parsed, engine);
      setBrand(parsed);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The archive is temporarily unavailable.'); });
    return () => controller.abort();
  }, [configPath]);
  if (error) return <main className="configuration"><h1>Archive unavailable</h1><p role="alert">{error}</p><button onClick={() => location.reload()}>Try again</button></main>;
  if (!brand) return <main><p role="status">Opening the archive…</p></main>;
  return <Archive brand={brand} />;
}
