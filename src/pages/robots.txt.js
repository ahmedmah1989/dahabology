import { B } from '../lib/site.js';

// Trial builds (no SITE_URL) ask search engines to stay away; the real site points them at the sitemap.
export const GET = ({ site }) => new Response(
  process.env.SITE_URL
    ? `User-agent: *\nAllow: /\nDisallow: ${B}owner/\nSitemap: ${new URL(B + 'sitemap.xml', site).href}\n`
    : 'User-agent: *\nDisallow: /\n',
  { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
