import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const shared = {
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    legalComments: 'none',
    minify: true,
    // Electron and its native bits are provided by the runtime.
    external: ['electron'],
};

// Electron main process: engine + server + window/tray shell.
await build({
    ...shared,
    entryPoints: [resolve(root, 'src/electron/main.ts')],
    outfile: resolve(root, 'dist/main.cjs'),
});

// The same engine without Electron, for development, tests and headless use.
await build({
    ...shared,
    entryPoints: [resolve(root, 'src/engine/cli.ts')],
    outfile: resolve(root, 'dist/server.cjs'),
});

console.log('Built dist/main.cjs and dist/server.cjs');
