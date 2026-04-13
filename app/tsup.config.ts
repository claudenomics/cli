import { chmod } from 'node:fs/promises';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  splitting: false,
  shims: false,
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __cnCreateRequire } from 'module';\nconst require = __cnCreateRequire(import.meta.url);",
  },
  external: ['@napi-rs/keyring', 'undici'],
  noExternal: [/^@claudenomics\//],
  onSuccess: async () => {
    await chmod('dist/index.js', 0o755);
  },
});
