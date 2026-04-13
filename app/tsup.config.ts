import { chmod, readFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));

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
  define: {
    __CLAUDENOMICS_VERSION__: JSON.stringify(pkg.version),
    __CLAUDENOMICS_AUTH_URL__: JSON.stringify('https://auth.claudenomics.xyz'),
    __CLAUDENOMICS_JWKS_URL__: JSON.stringify('https://auth.claudenomics.xyz/.well-known/jwks.json'),
    __CLAUDENOMICS_JWT_ISSUER__: JSON.stringify('https://auth.claudenomics.xyz'),
    __CLAUDENOMICS_ENCLAVE_URL__: JSON.stringify(
      'https://1cb777a00071d186d854b99916424720f6498e10-8090.dstack-pha-prod5.phala.network',
    ),
  },
  external: ['@napi-rs/keyring', 'undici'],
  noExternal: [/^@claudenomics\//],
  onSuccess: async () => {
    await chmod('dist/index.js', 0o755);
  },
});
