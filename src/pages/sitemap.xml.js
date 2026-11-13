import { B, PAGES, catalog } from '../lib/site.js';

// Every public page, for search engines. /owner/ is deliberately left out.
export async function GET({ site }) {
  const paths = ['', 'about/', ...PAGES.map(p => p.k + '/'), ...(await catalog()).map(c => `products/${c.id}/`)];
  const urls = paths.map(p => `<url><loc>${new URL(B + p, site).href}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
