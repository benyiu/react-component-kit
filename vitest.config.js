// The kit owns browser-safe component tests only. Cloudflare Functions and
// database tests remain with each consuming application.
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const version = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version;

export default defineConfig({
  plugins: [react()],
  define: {
    // ProfileBody renders `v${__CDD_APP_VERSION__}`; in the source repo the
    // token is defined by the shared build plugin from package.json.
    __CDD_APP_VERSION__: JSON.stringify(version),
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.jsx'],
    setupFiles: ['tests/setup.js'],
    globals: false,
    restoreMocks: true,
  },
});
