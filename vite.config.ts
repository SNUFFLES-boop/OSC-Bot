import { fileURLToPath, URL } from 'node:url';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// The UI is served by the engine's own HTTP server (and loaded by the Electron window),
// so it builds to plain static files with relative asset paths.
export default defineConfig({
    root: 'src/ui',
    base: './',
    plugins: [preact(), tailwindcss()],
    resolve: {
        alias: [{ find: '@', replacement: fileURLToPath(new URL('./src/ui', import.meta.url)) }],
    },
    server: {
        host: '127.0.0.1',
        port: 5180,
        strictPort: true,
        proxy: { '/ws': { target: 'ws://127.0.0.1:9876', ws: true } },
    },
    build: {
        outDir: '../../dist/ui',
        emptyOutDir: true,
        target: 'es2022',
        sourcemap: false,
    },
});
