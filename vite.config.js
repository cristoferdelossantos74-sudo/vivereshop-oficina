import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// "npm run build"      -> app normal (web, PC y APK)
// "npm run build:demo" -> un solo HTML de demostración (sin Firebase)
export default defineConfig(({ mode }) => ({
  base: './',
  define: { __DEMO__: JSON.stringify(mode === 'demo') },
  plugins: mode === 'demo' ? [viteSingleFile(), {
    name: 'demo-html',
    transformIndexHtml: (html) => html.replace(/\s*<link rel="(manifest|icon)"[^>]*>/g, '')
  }] : [],
  build: {
    outDir: mode === 'demo' ? 'dist-demo' : 'dist',
    chunkSizeWarningLimit: 2000,
    copyPublicDir: mode !== 'demo'
  }
}));
