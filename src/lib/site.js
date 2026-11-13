// Site-wide constants shared by every page.
export const ASSET_VERSION = process.env.GITHUB_SHA || process.env.SOURCE_REV || '20261114-compare1';
export const B = import.meta.env.BASE_URL.replace(/\/?$/, '/');

// Price snapshots are still produced by the gold-board collectors (GitHub Actions).
// Change this one line when the data moves.
export const DATA = 'https://ahmedmah1989.github.io/gold-board/data/';

// t: page name (nav, mobile bar, home orbs) • d: 24x24 stroke icon
export const PAGES = [
  { k: 'market', t: 'السوق', d: 'M3 12h4l2-6 4 12 2-6h6' },
  { k: 'products', t: 'المنتجات', d: 'M3 18l2-6h14l2 6zM8 12l1.2-5h5.6L16 12' },
  { k: 'calculator', t: 'الحاسبة', d: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01' },
  { k: 'invoice', t: 'افحص الفاتورة', d: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3' },
  { k: 'wallet', t: 'دهبي', d: 'M3 7a2 2 0 012-2h13v4M3 7v10a2 2 0 002 2h15V9H5a2 2 0 01-2-2zM16 14h.01' },
  { k: 'analysis', t: 'التحليل', d: 'M4 4v16h16M8 15l3-4 3 2 5-7' },
  { k: 'live', t: 'الرسم الحي', d: 'M7 3v18M5 8h4v7H5zM17 3v18M15 6h4v8h-4z' },
  { k: 'guide', t: 'الدليل', d: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM8 8h7M8 12h5' },
];
export const page = k => k === 'about' ? { k: 'about', t: 'حكايتنا', d: 'M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5' } : PAGES.find(p => p.k === k);

// Product catalog as of the last check; used only if the live catalog cannot be read while building.
const CATALOG_FALLBACK = [
  { id: 'quarter', name: 'ربع جنيه ذهب', kind: 'quarter', weight: 2, karat: 21 },
  { id: 'half', name: 'نصف جنيه ذهب', kind: 'half', weight: 4, karat: 21 },
  { id: 'pound', name: 'جنيه ذهب', kind: 'pound', weight: 8, karat: 21 },
  { id: 'bar1', name: 'سبيكة 1 جرام', kind: 'bars', weight: 1, karat: 24 },
  { id: 'bar2_5', name: 'سبيكة 2.5 جرام', kind: 'bars', weight: 2.5, karat: 24 },
  { id: 'bar5', name: 'سبيكة 5 جرام', kind: 'bars', weight: 5, karat: 24 },
  { id: 'bar10', name: 'سبيكة 10 جرام', kind: 'bars', weight: 10, karat: 24 },
  { id: 'bar20', name: 'سبيكة 20 جرام', kind: 'bars', weight: 20, karat: 24 },
  { id: 'bar50', name: 'سبيكة 50 جرام', kind: 'bars', weight: 50, karat: 24 },
  { id: 'bar100', name: 'سبيكة 100 جرام', kind: 'bars', weight: 100, karat: 24 },
  { id: 'ounce', name: 'أونصة ذهب فعلية', kind: 'ounce', weight: 31.1034768, karat: 24 },
];
let catalogCache;
/** Product list for building one page per product. */
export async function catalog() {
  if (catalogCache) return catalogCache;
  try {
    const r = await fetch(DATA + 'offers.json'), j = await r.json();
    const ok = Array.isArray(j.catalog) && j.catalog.length && j.catalog.every(c => /^[\w-]+$/.test(c.id) && c.name);
    catalogCache = ok ? j.catalog : CATALOG_FALLBACK;
  } catch { catalogCache = CATALOG_FALLBACK; }
  return catalogCache;
}
export const productSpec = c => (c.kind === 'ounce' ? 'أونصة ترويسية ≈ 31.1035 جرام' : c.weight + ' جرام') + ' • عيار ' + c.karat;

// Section ids of the old single page -> the page that now holds them.
const HOME_OF = {
  market: 'market', prices: 'market', comparison: 'market',
  products: 'products', live: 'live', analysis: 'analysis', calculator: 'calculator',
  sources: 'guide', guide: 'guide', faq: 'guide', coverage: 'guide', method: 'guide',
};

/** Point the old in-page #links and data/ links of a panel at their new addresses. */
export function panel(html, page) {
  return html
    .replace(/href="#([a-zA-Z]+)((?:\/[\w-]+)?)"/g, (m, id, rest) => {
      const pg = HOME_OF[id];
      if (!pg || pg === page) return m;
      return `href="${B}${pg}/${id === pg && !rest ? '' : '#' + id + rest}"`;
    })
    .replaceAll('href="data/', `href="${DATA}`);
}
