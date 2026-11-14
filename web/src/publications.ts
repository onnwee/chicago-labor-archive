// The publications in the catalog, in order of their first issue. `name` is the
// exact creator value scripts/build_import.py writes for each item, so it works as
// the catalog's creator filter. The years are the span of dated issues in the
// published import; change this list together with the import's LOCAL titles.
export type Publication = { name: string; years?: string };

export const PUBLICATIONS: Publication[] = [
  { name: "Workers' Call / Chicago Socialist", years: '1899–1907' },
  { name: 'International Socialist Review', years: '1900–1918' },
  { name: 'Socialist Party Official Bulletin / Party Builder', years: '1904–1914' },
  { name: 'Chicago Daily Socialist', years: '1906–1911' },
  { name: 'Proletarec', years: '1906–1908' },
  { name: 'Hope', years: '1910–1912' },
  { name: 'American Socialist', years: '1914–1917' },
  { name: 'Socialist World', years: '1920–1925' },
  { name: 'Industrial Pioneer', years: '1921–1924' },
  { name: 'New Majority', years: '1923' },
  { name: 'Voice of Labor', years: '1923–1924' },
  { name: 'Sojourner Truth Organization' },
];

/** Catalog link filtered to one publication. */
export function publicationHref(name: string): string {
  return `/?${new URLSearchParams({ creator: name })}#catalog`;
}
