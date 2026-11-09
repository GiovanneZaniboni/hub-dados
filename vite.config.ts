import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0, // nada inline: a CSP não permite data:/inline
    modulePreload: { polyfill: false }, // o polyfill injeta script inline
    cssCodeSplit: false,
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/io/**', 'src/export/**', 'src/state/**'],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
