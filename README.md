import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['sdk/src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  external: ['@mysten/sui'],
});
