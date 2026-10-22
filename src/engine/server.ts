import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { WebSocket, WebSocketServer } from 'ws';

import type { BotConfig } from '../shared/config';
import { type ClientMessage, PROTOCOL_VERSION, type ServerMessage, WS_PATH } from '../shared/protocol';
import type { Engine } from './engine';
import type { LogFn } from './store';

const TOKEN_COOKIE = 'osc_bot_token';
const MAX_MESSAGE_BYTES = 512 * 1024;

const CONTENT_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
};

export type PanelServer = ReturnType<typeof createPanelServer>;

/**
 * Serves the UI and the websocket on one port. This PC (loopback) is always trusted; other
 * devices are only served when remote access is on and they present the profile's token
 * (in the URL once, then as a cookie).
 */
export function createPanelServer({ uiRoot, log, onUrlChange }: { uiRoot: string; log: LogFn; onUrlChange?: (url: string) => void }) {
    let engine: Engine | null = null;
    let server: http.Server | null = null;
    let wss: WebSocketServer | null = null;
    let current: { port: number; allowLan: boolean; token: string } | null = null;
    let actualPort = 0;
    const clients = new Set<WebSocket>();

    function token() {
        return current?.token ?? '';
    }

    function authorized(request: IncomingMessage): boolean {
        if (isLoopback(request.socket.remoteAddress)) return true;
        if (!current?.allowLan) return false;
        const url = new URL(request.url ?? '/', 'http://localhost');
        const given = url.searchParams.get('token') ?? readCookie(request.headers.cookie, TOKEN_COOKIE);
        return Boolean(given) && given === token();
    }

    function handleRequest(request: IncomingMessage, response: ServerResponse) {
        if (!authorized(request)) {
            response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            response.end('OSC Bot: open the link (with its token) shown in the app.');
            return;
        }
        let url: URL;
        try {
            url = new URL(request.url ?? '/', 'http://localhost');
        } catch {
            response.writeHead(400).end();
            return;
        }
        const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
        if (url.searchParams.get('token') === token()) {
            headers['Set-Cookie'] = `${TOKEN_COOKIE}=${token()}; Path=/; HttpOnly; SameSite=Strict`;
        }

        const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
        const file = path.resolve(uiRoot, relative);
        if (!file.startsWith(path.resolve(uiRoot) + path.sep) && file !== path.resolve(uiRoot, 'index.html')) {
            response.writeHead(403).end();
            return;
        }
        fs.readFile(file, (error, data) => {
            if (error) {
                response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                response.end('Not found');
                return;
            }
            response.writeHead(200, {
                ...headers,
                'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
            });
            response.end(data);
        });
    }

    function handleUpgrade(request: IncomingMessage, socket: Socket, head: Buffer) {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (url.pathname !== WS_PATH || !authorized(request) || !sameOrigin(request)) {
            socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
            return;
        }
        wss?.handleUpgrade(request, socket, head, (ws) => {
            clients.add(ws);
            ws.on('close', () => clients.delete(ws));
            ws.on('error', () => clients.delete(ws));
            ws.on('message', (raw) => handleClientMessage(ws, raw));
        });
    }

    function handleClientMessage(ws: WebSocket, raw: WebSocket.RawData) {
        let message: ClientMessage;
        try {
            message = JSON.parse(String(raw));
        } catch {
            return;
        }
        if (!engine || typeof message !== 'object' || message === null) return;

        if (message.type === 'hello') {
            if (message.version !== PROTOCOL_VERSION) {
                send(ws, {
                    type: 'result',
                    requestId: null,
                    payload: { ok: false, action: 'hello', message: 'The app and this page are different versions. Reload.' },
                });
                return;
            }
            send(ws, { type: 'state', requestId: null, payload: engine.getState() });
            return;
        }

        if (message.type === 'config') {
            const saved = engine.updateConfig(message.payload?.config, String(message.requestId ?? ''));
            if (!saved) {
                send(ws, {
                    type: 'result',
                    requestId: message.requestId ?? null,
                    payload: { ok: false, action: 'config', message: 'Applied, but the profile could not be saved to disk.' },
                });
            }
            applyRemote(engine.config);
            return;
        }

        if (message.type === 'command' && message.payload && typeof message.payload.action === 'string') {
            const result = engine.command(message.payload);
            send(ws, {
                type: 'result',
                requestId: message.requestId ?? null,
                payload: { ...result, action: message.payload.action },
            });
        }
    }

    function listen(remote: BotConfig['remote']) {
        const previous = server;
        current = { port: remote.port, allowLan: remote.allowLan, token: remote.token };
        for (const client of clients) client.close(1012, 'Restarting');
        clients.clear();
        previous?.close();
        wss?.close();

        wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
        const next = http.createServer(handleRequest);
        server = next;
        next.on('upgrade', handleUpgrade);
        next.on('error', (error: NodeJS.ErrnoException) => {
            if (server !== next) return;
            if (error.code === 'EADDRINUSE' && actualPort === 0) {
                // Fall back to any free port rather than failing to open the app.
                log('warn', `Port ${remote.port} is busy; using a free port instead.`);
                next.listen(0, remote.allowLan ? '0.0.0.0' : '127.0.0.1');
                actualPort = -1;
                return;
            }
            log('error', 'Control panel server error.', error);
        });
        next.on('listening', () => {
            const address = next.address();
            actualPort = typeof address === 'object' && address ? address.port : remote.port;
            log('info', `Control panel on ${url()}`);
            onUrlChange?.(url());
        });
        actualPort = 0;
        next.listen(remote.port, remote.allowLan ? '0.0.0.0' : '127.0.0.1');
    }

    function applyRemote(config: BotConfig) {
        const remote = config.remote;
        if (current && current.port === remote.port && current.allowLan === remote.allowLan && current.token === remote.token) {
            return;
        }
        listen(remote);
    }

    function url() {
        return `http://127.0.0.1:${actualPort > 0 ? actualPort : (current?.port ?? 0)}/`;
    }

    return {
        attach(nextEngine: Engine) {
            engine = nextEngine;
            listen(nextEngine.config.remote);
        },
        broadcast(message: ServerMessage) {
            const data = JSON.stringify(message);
            for (const client of clients) {
                if (client.readyState === WebSocket.OPEN) client.send(data);
            }
        },
        url,
        get listening() {
            return Boolean(server?.listening);
        },
        /** Links a phone can open on this network (token included). */
        remoteUrls(): string[] {
            if (!current?.allowLan || actualPort <= 0) return [];
            return lanAddresses().map((ip) => `http://${ip}:${actualPort}/?token=${current?.token}`);
        },
        close() {
            for (const client of clients) client.terminate();
            clients.clear();
            wss?.close();
            server?.close();
            server = null;
        },
    };
}

function send(ws: WebSocket, message: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function sameOrigin(request: IncomingMessage): boolean {
    const origin = request.headers.origin;
    if (!origin) return true;
    try {
        return new URL(origin).host === request.headers.host;
    } catch {
        return false;
    }
}

function isLoopback(address: string | undefined): boolean {
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function readCookie(header: string | undefined, name: string): string | null {
    for (const part of (header ?? '').split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) return rest.join('=');
    }
    return null;
}

export function lanAddresses(): string[] {
    const result: string[] = [];
    for (const entries of Object.values(os.networkInterfaces())) {
        for (const entry of entries ?? []) {
            if (entry.family === 'IPv4' && !entry.internal) result.push(entry.address);
        }
    }
    return result;
}
