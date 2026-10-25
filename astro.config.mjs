import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.sn-trockenbau.de',
  output: 'static',
  compressHTML: false,
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
