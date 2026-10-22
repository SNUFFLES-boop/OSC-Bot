import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    type BotConfig,
    createBinding,
    createDefaultConfig,
    createMessage,
    createOutput,
    createRelay,
    EAction,
    ECondition,
    EHeartRateSource,
    EOutputSource,
    EParamType,
} from '../shared/config';
import { EOscState, EProviderState, type ServerMessage } from '../shared/protocol';
import { createEngine } from './engine';
import { decodePacket, encodeMessage, type OscArg } from './osc/codec';
import type { Peer, UdpSocket } from './osc/transport';
import { createHeartRateProvider } from './providers/heart-rate';

type Listener = (...args: any[]) => void;

class FakeSocket implements UdpSocket {
    listeners = new Map<string, Listener[]>();
    sent: { address: string; args: unknown[]; host: string; port: number }[] = [];
    raw: { host: string; port: number }[] = [];
    constructor(private readonly failBind: boolean) {}
    on(event: string, listener: Listener) {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
        return this;
    }
    emit(event: string, ...args: unknown[]) {
        for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }
    bind() {
        queueMicrotask(() =>
            this.failBind ? this.emit('error', Object.assign(new Error('busy'), { code: 'EADDRINUSE' })) : this.emit('listening'),
        );
    }
    send(message: Buffer, port: number, host: string, callback: (error: Error | null) => void) {
        this.raw.push({ host, port });
        for (const decoded of decodePacket(message)) {
            this.sent.push({ address: decoded.address, args: decoded.args.map((arg) => arg.value), host, port });
        }
        callback(null);
    }
    close() {}
    receive(address: string, args: OscArg[], peer: Peer = { address: '127.0.0.1', port: 50000 }) {
        this.emit('message', encodeMessage(address, args), peer);
    }
}

const fakeProvider = () => ({
    start: vi.fn(),
    stop: vi.fn(),
    control: vi.fn(() => true),
    setGpu: vi.fn(),
    refresh: vi.fn(),
    music: null,
    system: null,
    weather: null,
    status: { state: EProviderState.Off, detail: null },
});

function setup(patch: (config: BotConfig) => void = () => undefined, { failBind = false } = {}) {
    const config = createDefaultConfig();
    config.media.enabled = false;
    config.system.enabled = false;
    patch(config);
    const sockets: FakeSocket[] = [];
    const published: ServerMessage[] = [];
    const media = fakeProvider();
    const heartRate = createHeartRateProvider({ onChange: () => undefined });
    let idle: number | null = 0;
    const engine = createEngine({
        store: { file: null, load: () => config, save: () => true },
        log: () => undefined,
        publish: (message) => published.push(message),
        host: {
            info: () => ({ kind: 'standalone', version: 'test', platform: 'test', remoteUrls: [] }),
            idleSeconds: () => idle,
        },
        createSocket: () => {
            const socket = new FakeSocket(failBind && sockets.length === 1);
            sockets.push(socket);
            return socket;
        },
        providers: {
            media: media as never,
            system: fakeProvider() as never,
            weather: fakeProvider() as never,
            heartRate,
        },
    });
    return {
        engine,
        media,
        published,
        setIdle: (value: number | null) => {
            idle = value;
        },
        sender: () => sockets[sockets.length - 2],
        listener: () => sockets[sockets.length - 1],
        chatbox: () =>
            sockets
                .flatMap((socket) => socket.sent)
                .filter((packet) => packet.address === '/chatbox/input')
                .map((packet) => packet.args[0]),
    };
}

describe('engine', () => {
    beforeEach(() => vi.useFakeTimers({ now: new Date(2026, 9, 22, 12, 0, 0) }));
    afterEach(() => vi.useRealTimers());

    it('listens on loopback and falls back to send-only when the port is taken', async () => {
        const ok = setup();
        await vi.advanceTimersByTimeAsync(0);
        expect(ok.engine.getState().status.osc).toBe(EOscState.Listening);
        ok.engine.close();

        const busy = setup(() => undefined, { failBind: true });
        await vi.advanceTimersByTimeAsync(0);
        expect(busy.engine.getState().status.osc).toBe(EOscState.SendOnly);
        expect(busy.chatbox().length).toBeGreaterThan(0);
        busy.engine.close();
    });

    it('rotates messages, skips unmet conditions and respects VRChat spacing', async () => {
        const harness = setup((config) => {
            config.chatbox.intervalSeconds = 5;
            config.chatbox.messages = [createMessage('A {time}'), createMessage('♫ {song}', ECondition.MusicPlaying), createMessage('B')];
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(harness.chatbox()).toEqual(['A 12:00']);
        await vi.advanceTimersByTimeAsync(5000);
        expect(harness.chatbox()).toEqual(['A 12:00', 'B']);

        // A manual send right after waits for the spam window instead of being dropped.
        harness.engine.command({ action: 'chatbox_send', text: 'hello' });
        expect(harness.chatbox().at(-1)).toBe('B');
        await vi.advanceTimersByTimeAsync(1600);
        expect(harness.chatbox().at(-1)).toBe('hello');
        harness.engine.close();
    });

    it('shows the AFK message from VRChat or system idle', async () => {
        const harness = setup((config) => {
            config.chatbox.intervalSeconds = 3;
            config.chatbox.messages = [createMessage('Hi')];
            config.afk.idleMinutes = 1;
        });
        await vi.advanceTimersByTimeAsync(0);
        harness.listener().receive('/avatar/parameters/AFK', [{ type: 'T', value: true }]);
        await vi.advanceTimersByTimeAsync(3000);
        expect(harness.chatbox().at(-1)).toMatch(/^💤 AFK for 0:0[0-3]$/);

        harness.listener().receive('/avatar/parameters/AFK', [{ type: 'F', value: false }]);
        harness.setIdle(120);
        await vi.advanceTimersByTimeAsync(3000);
        expect(harness.chatbox().at(-1)).toMatch(/^💤 AFK for 2:0\d$/);
        harness.engine.close();
    });

    it('runs bindings on rising edges', async () => {
        const harness = setup((config) => {
            config.media.enabled = true;
            config.chatbox.enabled = false;
            config.bindings = [
                createBinding({ address: '/avatar/parameters/Skip', action: EAction.MediaNext }),
                createBinding({
                    address: '/avatar/parameters/Light*',
                    action: EAction.SendOsc,
                    oscAddress: '/avatar/parameters/Glow',
                    oscValue: 0.5,
                    oscType: EParamType.Float,
                }),
            ];
        });
        await vi.advanceTimersByTimeAsync(0);
        harness.listener().receive('/avatar/parameters/Skip', [{ type: 'T', value: true }]);
        harness.listener().receive('/avatar/parameters/Skip', [{ type: 'F', value: false }]);
        harness.listener().receive('/avatar/parameters/LightOn', [{ type: 'i', value: 1 }]);
        expect(harness.media.control).toHaveBeenCalledTimes(1);
        expect(harness.media.control).toHaveBeenCalledWith('next');
        expect(harness.sender().sent.find((packet) => packet.address === '/avatar/parameters/Glow')?.args).toEqual([0.5]);
        harness.engine.close();
    });

    it('syncs live values to avatar parameters only when they change', async () => {
        const harness = setup((config) => {
            config.chatbox.enabled = false;
            config.heartRate.enabled = true;
            config.heartRate.source = EHeartRateSource.Osc;
            config.heartRate.oscAddress = '/hr';
            config.outputs = [
                createOutput({ address: '/avatar/parameters/HR', source: EOutputSource.HeartRate, type: EParamType.Int }),
                createOutput({ address: '/avatar/parameters/Hours', source: EOutputSource.Hour, type: EParamType.Float }),
            ];
        });
        await vi.advanceTimersByTimeAsync(0);
        harness.listener().receive('/hr', [{ type: 'i', value: 72 }]);
        await vi.advanceTimersByTimeAsync(2000);
        const sent = () => harness.sender().sent.filter((packet) => packet.address === '/avatar/parameters/HR');
        expect(sent().map((packet) => packet.args)).toEqual([[72]]);
        expect(harness.sender().sent.find((packet) => packet.address === '/avatar/parameters/Hours')?.args).toEqual([0.5]);
        harness.listener().receive('/hr', [{ type: 'i', value: 90 }]);
        await vi.advanceTimersByTimeAsync(600);
        expect(sent().map((packet) => packet.args)).toEqual([[72], [90]]);
        harness.engine.close();
    });

    it('forwards raw packets to relays', async () => {
        const harness = setup((config) => {
            config.chatbox.enabled = false;
            config.relays = [createRelay({ port: 9002 }), createRelay({ port: 9003, pattern: '/tracking/*' })];
        });
        await vi.advanceTimersByTimeAsync(0);
        harness.listener().receive('/avatar/parameters/X', [{ type: 'f', value: 1 }]);
        const ports = harness.sender().raw.map((entry) => entry.port);
        expect(ports).toContain(9002);
        expect(ports).not.toContain(9003);
        harness.engine.close();
    });

    it('clears the chatbox on close and when paused', async () => {
        const harness = setup((config) => {
            config.chatbox.messages = [createMessage('Hi')];
        });
        await vi.advanceTimersByTimeAsync(0);
        harness.engine.command({ action: 'chatbox_toggle' });
        expect(harness.chatbox().at(-1)).toBe('');
        expect(harness.engine.getState().status.chatboxPaused).toBe(true);
        harness.engine.command({ action: 'chatbox_toggle' });
        await vi.advanceTimersByTimeAsync(1600);
        expect(harness.chatbox().at(-1)).toBe('Hi');
        harness.engine.close();
        expect(harness.chatbox().at(-1)).toBe('');
    });
});
