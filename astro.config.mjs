// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://transcribe.aihelpcenter.dev',
  output: 'static',
  integrations: [react(), sitemap()],
  vite: {
    worker: {
      format: 'es',
    },
  },
});