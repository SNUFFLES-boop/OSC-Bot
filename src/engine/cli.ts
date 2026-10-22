// Runs the engine and control panel without Electron: development (`pnpm dev`), tests and
// headless use (`node dist/server.cjs`, then open the printed URL).
import path from 'node:path';

import { createEngine } from './engine';
import { createPanelServer } from './server';
import { consoleLog, createConfigStore } from './store';

const dev = process.argv.includes('--dev');
const configFile = process.env.OSC_BOT_CONFIG ?? (dev ? path.resolve('osc-bot-dev.json') : path.resolve('osc-bot.json'));

const server = createPanelServer({ uiRoot: path.join(__dirname, 'ui'), log: consoleLog });
const engine = createEngine({
    store: createConfigStore(configFile, consoleLog),
    log: consoleLog,
    publish: (message) => server.broadcast(message),
    host: {
        info: () => ({
            kind: 'standalone',
            version: process.env.npm_package_version ?? 'dev',
            platform: process.platform,
            remoteUrls: server.remoteUrls(),
        }),
    },
});
server.attach(engine);

consoleLog('info', `Profile: ${configFile}`);
if (dev) consoleLog('info', 'UI dev server: http://127.0.0.1:5180/');

function shutdown() {
    engine.close();
    server.close();
    setTimeout(() => process.exit(0), 200);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
