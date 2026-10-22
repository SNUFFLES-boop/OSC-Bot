import { fileURLToPath, URL } from 'node:url';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [preact()],
    resolve: {
        alias: [{ find: '@', replacement: fileURLToPath(new URL('./src/ui', import.meta.url)) }],
    },
    test: {
        environment: 'node',
        include: ['src/**/*.test.{ts,tsx}'],
        restoreMocks: true,
    },
});
