import Appearance from './Appearance';
import type { Brand } from '../brand';

export default function ChicagoHeader({ brand }: { brand: Brand }) {
  // The two-line lockup breaks after the first word of the working title.
  const [first, ...rest] = brand.title.split(' ');
  return <header className="chicago-header">
    <a className="wordmark chicago-wordmark" href="/" aria-label={`${brand.title} home`}>
      <span className="chicago-mark" aria-hidden="true"><img className="mark-light" src={brand.logo} alt="" /><img className="mark-dark" src="/brand/chicago-labor-archive/mark-dark.svg" alt="" loading="lazy" /></span>
      <span className="chicago-name">{first}<br />{rest.join(' ')}<span className="chicago-subtitle">{brand.subtitle}</span></span>
    </a>
    <nav aria-label="Main navigation"><a href="#catalog">Browse the catalog</a><a href="#archive-about">About the archive</a></nav>
    <Appearance />
  </header>;
}
