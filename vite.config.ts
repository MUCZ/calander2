/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Inlines the JS and CSS bundles into index.html so the production build is a
 * single self-contained file. This keeps static previews (e.g. GitHub Pages)
 * trivial to publish and makes the app work from any sub-path.
 */
function inlineBundle(): Plugin {
  return {
    name: 'inline-bundle',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((f) => f.fileName === 'index.html');
      if (!html || html.type !== 'asset') return;
      let source = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && file.isEntry) {
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          source = source.replace(
            new RegExp(`<script[^>]*src="[^"]*${escapeRe(file.fileName)}"[^>]*></script>`),
            () => `<script type="module">${code}</script>`,
          );
          delete bundle[name];
        } else if (file.type === 'asset' && file.fileName.endsWith('.css')) {
          source = source.replace(
            new RegExp(`<link[^>]*href="[^"]*${escapeRe(file.fileName)}"[^>]*>`),
            () => `<style>${String(file.source)}</style>`,
          );
          delete bundle[name];
        }
      }
      html.source = source;
    },
  };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineConfig({
  base: './',
  plugins: [react(), inlineBundle()],
  build: { modulePreload: false },
  test: {
    environment: 'node',
    // A DST-observing zone proves the "floating time" math is timezone independent.
    env: { TZ: 'America/New_York' },
    include: ['tests/**/*.test.ts'],
  },
});
