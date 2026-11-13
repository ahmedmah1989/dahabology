import { B } from '../lib/site.js';

// Web app manifest: lets the site be installed on a phone's home screen.
export const GET = () => new Response(JSON.stringify({
  name: 'دهبولوجي — أسعار الذهب في مصر',
  short_name: 'دهبولوجي',
  description: 'سعر الذهب في مصر، الفجوة مع العالمي، حاسبة الذهب، وفحص الفاتورة.',
  lang: 'ar', dir: 'rtl',
  start_url: B, scope: B, display: 'standalone', orientation: 'portrait',
  background_color: '#0a1628', theme_color: '#0a1628',
  icons: [
    { src: B + 'assets/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: B + 'assets/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
  shortcuts: [
    { name: 'السوق الآن', url: B + 'market/' },
    { name: 'حاسبة الذهب', url: B + 'calculator/' },
    { name: 'افحص الفاتورة', url: B + 'invoice/' },
    { name: 'دهبي', url: B + 'wallet/' },
  ],
}), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } });
