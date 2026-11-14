import Appearance from './Appearance';
import type { Brand } from '../brand';

// On the catalog page the section links stay in-page so they keep the current filters.
export default function ChicagoHeader({ brand, home = true }: { brand: Brand; home?: boolean }) {
  const base = home ? '' : '/';
  // The two-line lockup breaks after the first word of the working title.
  const [first, ...rest] = brand.title.split(' ');
  return <header className="chicago-header">
    <a className="wordmark chicago-wordmark" href="/" aria-label={`${brand.title} home`}>
      <span className="chicago-mark" aria-hidden="true"><img className="mark-light" src={brand.logo} alt="" /><img className="mark-dark" src="/brand/chicago-labor-archive/mark-dark.svg" alt="" loading="lazy" /></span>
      <span className="chicago-name">{first}<br />{rest.join(' ')}<span className="chicago-subtitle">{brand.subtitle}</span></span>
    </a>
    <nav aria-label="Main navigation"><a href={`${base}#catalog`}>Browse the catalog</a><a href="/publications" aria-current={home ? undefined : 'page'}>Publications</a><a href={`${base}#archive-about`}>About the archive</a></nav>
    <Appearance />
  </header>;
}
