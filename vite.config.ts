import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// The privacy lock. In the built app the browser may only talk to the app's
// own address, so transaction data has no way to leave the device.
// "connect-src 'self'" exists for one reason: the photo reader has to load
// its own engine and language file, which ship with the app. Every other
// address is refused. 'wasm-unsafe-eval' lets that engine (WebAssembly) run.
// The lock is added at build time only, because the dev server needs a
// local websocket for live reload.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

function strictCsp(): Plugin {
  return {
    name: 'strict-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="utf-8" />',
        `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  // Relative paths so the site works from any GitHub Pages sub-folder.
  base: './',
  plugins: [react(), strictCsp()],
  server: { port: 5173 },
});
