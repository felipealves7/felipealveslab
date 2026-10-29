import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://felipealveslab.com',
  output: 'static',
  // /milestones is built as milestones.html. Cloudflare Pages serves it without the extension.
  build: { format: 'file' },
  trailingSlash: 'never',
});
