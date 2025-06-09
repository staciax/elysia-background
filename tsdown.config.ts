import { defineConfig } from 'tsdown';

export default defineConfig(() => {
  return {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    clean: true,
    minify: false,
    dts: true,
    external: ['elysia'],
  };
});
