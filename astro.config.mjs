import { defineConfig } from 'astro/config';

// BASE_PATH is the folder the site is served from: "/" on its own domain,
// "/gold-board" when published under the current GitHub Pages address.
export default defineConfig({
  site: process.env.SITE_URL || 'https://ahmedmah1989.github.io',
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'always',
});
