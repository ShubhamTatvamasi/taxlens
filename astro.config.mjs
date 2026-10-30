// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

// The site is served from https://shubhamtatvamasi.com/<repo>/ via GitHub Pages.
// BASE_PATH is set by the deploy workflow from the repository name, so renaming
// the repo needs no code change.
const base = process.env.BASE_PATH ?? '/taxlens';

export default defineConfig({
  site: 'https://shubhamtatvamasi.com',
  base,
  trailingSlash: 'ignore',
  integrations: [preact()],
  vite: {
    worker: { format: 'es' },
  },
});
