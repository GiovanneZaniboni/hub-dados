import { defineConfig } from 'vite';

/**
 * Build intermediário da versão "arquivo único" (ver scripts/make-standalone.mjs).
 * JavaScript clássico (IIFE, sem módulos ES, que o navegador bloqueia em file://) e fontes embutidas
 * no CSS, já que fontes externas também são bloqueadas ao abrir por duplo clique.
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'standalone-tmp',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 100_000_000,
    modulePreload: { polyfill: false },
    cssCodeSplit: false,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
});
