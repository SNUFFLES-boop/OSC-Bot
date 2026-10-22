import {
    type Binding,
    type BotConfig,
    EAction,
    EHeartRateSource,
    isValidAddress,
    isValidHost,
    isValidPort,
    LIMITS,
    normalizeConfig,
} from '../shared/config';
import {
    type BotStatus,
    type Command,
    EDirection,
    EOscState,
    emptyLiveState,
    type HostInfo,
    type LiveState,
    type ServerMessage,
    type StatePayload,
} from '../shared/protocol';
import { conditionMet, renderTemplate } from '../shared/template';
import { createActivityLog } from './activity';
import { argsFromPreviews, matchesOscAddress, type OscArg, type OscMessage } from './osc/codec';
import { createTransport, type Peer, type Transport, type UdpSocket } from './osc/transport';
import { outputArgs, paramArgs } from './outputs';
import { createHeartRateProvider } from './providers/heart-rate';
import { createMediaProvider } from './providers/media';
import { createSystemProvider } from './providers/system';
import { createWeatherProvider } from './providers/weather';
import type { ConfigStore, LogFn } from './store';

export type EngineHost = {
    info: () => HostInfo;
    /** Seconds since the last keyboard/mouse input, when the host can tell (Electron). */
    idleSeconds?: () => number | null;
    onConfigApplied?: (config: BotConfig, previous: BotConfig) => void;
};

export type EngineOptions = {
    store: ConfigStore;
    log: LogFn;
    host: EngineHost;
    publish: (message: ServerMessage) => void;
    createSocket?: () => UdpSocket;
    providers?: {
        media?: ReturnType<typeof createMediaProvider>;
        system?: ReturnType<typeof createSystemProvider>;
        heartRate?: ReturnType<typeof createHeartRateProvider>;
        weather?: ReturnType<typeof createWeatherProvider>;
    };
};

const TYPING_LEAD_MS = 700;
const OUTPUT_INTERVAL_MS = 500;
const OUTPUT_KEEPALIVE_MS = 5000;
const CLOSE_GRACE_MS = 150;
const AVATAR_PREFIX = '/avatar/parameters/';

export function createEngine({ store, log, host, publish, createSocket, providers = {} }: EngineOptions) {
    let config = store.load();
    const startedAt = Date.now();
    let closed = false;

    // ---- state -------------------------------------------------------------------------
    let oscState = EOscState.Starting;
    let listenAddress: string | null = null;
    let oscError: string | null = null;
    let transport: Transport | null = null;
    let vrchatSeenAt: number | null = null;
    let avatarId: string | null = null;
    let params: Record<string, number | boolean | string> = {};
    let manualAfk = false;
    let afkSince: number | null = null;

    let chatboxPaused = false;
    let rotation = 0;
    let seed = 0;
    let holdUntil = 0;
    let lastSentAt = Number.NEGATIVE_INFINITY;
    let lastSentText: string | null = null;
    let lastChatboxAt: number | null = null;
    let pendingChat: { text: string; notify: boolean } | null = null;
    let lastSongKey: string | null = null;
    const lastOutputs = new Map<string, { value: string; at: number }>();

    const timers = new Set<ReturnType<typeof setTimeout>>();
    let chatTimer: ReturnType<typeof setInterval> | null = null;
    let deliveryTimer: ReturnType<typeof setTimeout> | null = null;

    const activity = createActivityLog((entries) => publish({ type: 'activity', payload: { entries } }));
    const media = providers.media ?? createMediaProvider({ onChange: onMediaChange });
    const system = providers.system ?? createSystemProvider({ onChange: () => undefined });
    const heartRate = providers.heartRate ?? createHeartRateProvider({ onChange: () => undefined });
    const weather = providers.weather ?? createWeatherProvider({ onChange: () => undefined });

    // ---- transport -----------------------------------------------------------------------

    function startTransport() {
        transport?.close();
        listenAddress = null;
        oscError = null;
        transport = createTransport({
            port: config.osc.listenPort,
            lan: config.osc.listenLan,
            relays: config.relays,
            createSocket,
            onMessage: handleMessage,
            onPacket: (direction) => activity.packet(direction),
            onDecodeError: (error, peer) => {
                activity.error();
                activity.record({
                    direction: EDirection.Error,
                    address: '',
                    peer: `${peer.address}:${peer.port}`,
                    note: `Malformed packet: ${error.message}`,
                    failed: true,
                });
            },
            onSendError: (error, target) => {
                activity.error();
                log('warn', `Send to ${target} failed.`, error);
                activity.record({
                    direction: EDirection.Error,
                    address: '',
                    peer: target,
                    note: error.message,
                    failed: true,
                });
            },
            onState: (state, detail) => {
                oscState = state;
                if (state === EOscState.Listening) {
                    listenAddress = detail;
                    oscError = null;
                } else if (detail) {
                    oscError = detail;
                }
                if (state === EOscState.SendOnly && detail) {
                    activity.record({ direction: EDirection.Error, address: '', note: detail, failed: true });
                }
                publishTick();
            },
        });
    }

    function sendToVrchat(address: string, args: OscArg[], note: string | null = null) {
        if (!transport) return;
        transport.send(config.osc.vrchatHost, config.osc.vrchatPort, address, args);
        activity.record({
            direction: EDirection.Out,
            address,
            args,
            peer: `${config.osc.vrchatHost}:${config.osc.vrchatPort}`,
            note,
        });
    }

    // ---- incoming ------------------------------------------------------------------------

    function handleMessage(message: OscMessage, peer: Peer) {
        const { address, args } = message;
        const first = args[0];
        const notes: string[] = [];
        let failed = false;

        if (address.startsWith(AVATAR_PREFIX)) {
            vrchatSeenAt = Date.now();
            if (first && first.value !== null && !Buffer.isBuffer(first.value)) {
                params[address.slice(AVATAR_PREFIX.length)] = first.value as number | boolean | string;
            }
        } else if (address === '/avatar/change') {
            vrchatSeenAt = Date.now();
            avatarId = typeof first?.value === 'string' ? first.value : null;
            params = {};
            notes.push('Avatar changed');
        }

        if (
            config.heartRate.enabled &&
            config.heartRate.source === EHeartRateSource.Osc &&
            matchesOscAddress(config.heartRate.oscAddress, address)
        ) {
            const value = typeof first?.value === 'number' ? first.value : Number(first?.value);
            // Some sensor bridges send a 0..1 fraction of the max instead of bpm.
            heartRate.report(value > 0 && value <= 1 ? value * config.heartRate.maxBpm : value);
            notes.push('Heart rate');
        }

        let bindingId: string | null = null;
        for (const binding of config.bindings) {
            if (!binding.enabled || !matchesOscAddress(binding.address, address)) continue;
            bindingId ??= binding.id;
            if (!isTriggered(args)) continue;
            const result = runBinding(binding);
            notes.push(result.note);
            failed ||= result.failed;
        }

        activity.record({
            direction: EDirection.In,
            address,
            args,
            peer: `${peer.address}:${peer.port}`,
            note: notes.join(' · ') || null,
            failed,
            bindingId,
        });
    }

    function runBinding(binding: Binding): { note: string; failed: boolean } {
        switch (binding.action) {
            case EAction.ChatboxSend:
                return announce(render(binding.text))
                    ? { note: 'Chatbox message', failed: false }
                    : { note: 'Chatbox message is empty', failed: true };
            case EAction.ChatboxToggle:
                setChatboxPaused(!chatboxPaused);
                return { note: chatboxPaused ? 'Chatbox paused' : 'Chatbox resumed', failed: false };
            case EAction.ChatboxNext:
                holdUntil = 0;
                chatboxTick(true);
                return { note: 'Next chatbox message', failed: false };
            case EAction.ChatboxClear:
                clearChatbox();
                return { note: 'Chatbox cleared', failed: false };
            case EAction.MediaPlayPause:
            case EAction.MediaNext:
            case EAction.MediaPrevious: {
                const op =
                    binding.action === EAction.MediaNext ? 'next' : binding.action === EAction.MediaPrevious ? 'previous' : 'play_pause';
                return media.control(op)
                    ? { note: `Media ${op.replace('_', '/')}`, failed: false }
                    : { note: 'Media controls are not running', failed: true };
            }
            case EAction.SendOsc:
                sendToVrchat(binding.oscAddress, paramArgs(binding.oscValue, binding.oscType), 'Binding');
                return { note: `Sent ${binding.oscAddress}`, failed: false };
            case EAction.AfkToggle:
                manualAfk = !manualAfk;
                return { note: manualAfk ? 'AFK on' : 'AFK off', failed: false };
            default:
                return { note: 'Unknown action', failed: true };
        }
    }

    // ---- live state ----------------------------------------------------------------------

    function computeAfk(now: number): boolean {
        const vrchatAfk = config.afk.useVrchat && params.AFK === true;
        const idle = config.afk.useSystemIdle ? host.idleSeconds?.() : null;
        const systemAfk = typeof idle === 'number' && idle >= config.afk.idleMinutes * 60;
        const afk = manualAfk || vrchatAfk || systemAfk;
        if (!afk) {
            afkSince = null;
            return false;
        }
        afkSince ??= now;
        // AFK time counts from whichever began first, including idleness before the threshold.
        if (systemAfk && typeof idle === 'number') afkSince = Math.min(afkSince, now - idle * 1000);
        return true;
    }

    function getLive(now = Date.now()): LiveState {
        const afk = computeAfk(now);
        return {
            ...emptyLiveState(),
            uptimeSeconds: (now - startedAt) / 1000,
            music: config.media.enabled ? media.music : null,
            system: config.system.enabled ? system.system : null,
            heartRate: config.heartRate.enabled ? heartRate.bpm : null,
            weather: config.weather.enabled ? weather.weather : null,
            afk,
            afkSeconds: afkSince === null ? 0 : (now - afkSince) / 1000,
            muted: typeof params.MuteSelf === 'boolean' ? params.MuteSelf : null,
            avatarId,
            params: { ...params },
            providers: {
                media: media.status,
                system: system.status,
                heartRate: heartRate.status,
                weather: weather.status,
            },
        };
    }

    function getStatus(): BotStatus {
        const counters = activity.counters;
        return {
            osc: oscState,
            listenAddress,
            error: oscError,
            startedAt: new Date(startedAt).toISOString(),
            ...counters,
            chatboxPaused,
            lastChatbox: lastSentText,
            lastChatboxAt: lastChatboxAt ? new Date(lastChatboxAt).toISOString() : null,
            vrchatSeenAt: vrchatSeenAt ? new Date(vrchatSeenAt).toISOString() : null,
        };
    }

    function render(template: string): string {
        return renderTemplate(template, { now: new Date(), live: getLive(), seed });
    }

    // ---- chatbox ---------------------------------------------------------------------------

    function scheduleChatbox() {
        if (chatTimer) clearInterval(chatTimer);
        chatTimer = null;
        if (!config.chatbox.enabled || closed) return;
        chatTimer = setInterval(() => chatboxTick(false), config.chatbox.intervalSeconds * 1000);
        chatTimer.unref?.();
        chatboxTick(false);
    }

    function chatboxTick(force: boolean) {
        if (closed || !config.chatbox.enabled || chatboxPaused) return;
        if (!force && Date.now() < holdUntil) return;

        const live = getLive();
        if (live.afk && config.chatbox.afkMessage.trim()) {
            queueChat(render(config.chatbox.afkMessage), false);
            return;
        }

        const messages = config.chatbox.messages.filter(
            (message) => message.enabled && message.text.trim() && conditionMet(message.condition, live),
        );
        for (let offset = 0; offset < messages.length; offset += 1) {
            const index = (rotation + offset) % messages.length;
            seed += 1;
            const text = render(messages[index].text);
            if (text.trim()) {
                rotation = index + 1;
                queueChat(text, false);
                return;
            }
        }
        if (lastSentText) queueChat('', false);
    }

    /** One-off message held on screen for a full interval. */
    function announce(text: string): boolean {
        if (!text.trim() || closed) return false;
        holdUntil = Date.now() + config.chatbox.intervalSeconds * 1000;
        queueChat(text, config.chatbox.notifySound);
        return true;
    }

    function clearChatbox() {
        holdUntil = Date.now() + config.chatbox.intervalSeconds * 1000;
        queueChat('', false);
    }

    function queueChat(text: string, notify: boolean) {
        // Newest wins: VRChat silently drops messages sent faster than its spam window.
        pendingChat = { text, notify };
        const wait = lastSentAt + LIMITS.chatboxMinSpacingMs - Date.now();
        if (wait <= 0) {
            deliverChat();
        } else if (!deliveryTimer) {
            deliveryTimer = later(() => {
                deliveryTimer = null;
                deliverChat();
            }, wait);
        }
    }

    function deliverChat() {
        const next = pendingChat;
        pendingChat = null;
        if (!next || closed) return;
        lastSentAt = Date.now();
        if (config.chatbox.typingIndicator && next.text) {
            sendToVrchat('/chatbox/typing', [{ type: 'T', value: true }]);
            later(() => sendChatInput(next.text, next.notify), TYPING_LEAD_MS);
            return;
        }
        sendChatInput(next.text, next.notify);
    }

    function sendChatInput(text: string, notify: boolean) {
        sendToVrchat('/chatbox/input', [
            { type: 's', value: text },
            { type: 'T', value: true },
            notify ? { type: 'T', value: true } : { type: 'F', value: false },
        ]);
        lastSentText = text;
        lastChatboxAt = Date.now();
    }

    function setChatboxPaused(paused: boolean) {
        chatboxPaused = paused;
        if (paused) {
            pendingChat = null;
            if (lastSentText) sendChatInput('', false);
        } else {
            holdUntil = 0;
            chatboxTick(true);
        }
        publishTick();
    }

    function onMediaChange() {
        const music = media.music;
        const key = music?.playing ? `${music.title}\u0000${music.artist}` : null;
        if (
            key &&
            key !== lastSongKey &&
            config.media.enabled &&
            config.chatbox.enabled &&
            config.chatbox.announceSongs &&
            !chatboxPaused
        ) {
            // The first song seen after start is not "new"; only changes are announced.
            if (lastSongKey !== null) announce(render(config.chatbox.songTemplate));
        }
        if (key) lastSongKey = key;
    }

    // ---- avatar sync -----------------------------------------------------------------------

    function syncOutputs() {
        if (closed || config.outputs.length === 0) return;
        const now = new Date();
        const live = getLive(now.getTime());
        for (const output of config.outputs) {
            if (!output.enabled) continue;
            const args = outputArgs(output, live, now, config.heartRate.maxBpm);
            if (!args) continue;
            const value = JSON.stringify(args);
            const last = lastOutputs.get(output.id);
            if (last && last.value === value && now.getTime() - last.at < OUTPUT_KEEPALIVE_MS) continue;
            lastOutputs.set(output.id, { value, at: now.getTime() });
            sendToVrchat(output.address, args);
        }
    }

    // ---- providers -------------------------------------------------------------------------

    function applyProviders(previous: BotConfig | null) {
        if (config.media.enabled) media.start();
        else media.stop();

        if (config.system.enabled) {
            system.start(config.system.gpu);
            if (previous && previous.system.gpu !== config.system.gpu) system.setGpu(config.system.gpu);
        } else {
            system.stop();
        }

        if (config.heartRate.enabled) {
            heartRate.start(config.heartRate.source === EHeartRateSource.Pulsoid ? config.heartRate.pulsoidToken : '');
        } else {
            heartRate.stop();
        }

        if (config.weather.enabled && config.weather.city) weather.start(config.weather.city, config.weather.unit);
        else weather.stop();
    }

    // ---- lifecycle ---------------------------------------------------------------------------

    function later(fn: () => void, ms: number) {
        const timer = setTimeout(() => {
            timers.delete(timer);
            fn();
        }, ms);
        timer.unref?.();
        timers.add(timer);
        return timer;
    }

    function publishTick() {
        if (closed) return;
        publish({ type: 'tick', payload: { status: getStatus(), live: getLive() } });
    }

    const tickTimer = setInterval(() => {
        activity.tick();
        publishTick();
    }, 1000);
    tickTimer.unref?.();
    const outputTimer = setInterval(syncOutputs, OUTPUT_INTERVAL_MS);
    outputTimer.unref?.();

    startTransport();
    applyProviders(null);
    scheduleChatbox();

    function getState(): StatePayload {
        return {
            config,
            status: getStatus(),
            live: getLive(),
            activity: activity.snapshot(),
            host: host.info(),
        };
    }

    return {
        getState,
        get config() {
            return config;
        },
        updateConfig(raw: unknown, requestId: string | null = null): boolean {
            const previous = config;
            const next = normalizeConfig(raw);
            config = next;
            const saved = store.save(next);

            if (previous.osc.listenPort !== next.osc.listenPort || previous.osc.listenLan !== next.osc.listenLan) {
                startTransport();
            } else {
                transport?.setRelays(next.relays);
            }
            applyProviders(previous);
            if (previous.chatbox.enabled && !next.chatbox.enabled && lastSentText) {
                sendChatInput('', false);
            }
            if (previous.chatbox.enabled !== next.chatbox.enabled || previous.chatbox.intervalSeconds !== next.chatbox.intervalSeconds) {
                scheduleChatbox();
            }
            const removed = new Set(previous.outputs.map((output) => output.id));
            for (const output of next.outputs) removed.delete(output.id);
            for (const id of removed) lastOutputs.delete(id);

            host.onConfigApplied?.(next, previous);
            publish({ type: 'state', requestId, payload: getState() });
            return saved;
        },
        command(command: Command): { ok: boolean; message: string | null } {
            switch (command.action) {
                case 'chatbox_send': {
                    const text = render(String(command.text ?? ''));
                    return announce(text) ? ok() : fail('Nothing to send: the message renders empty.');
                }
                case 'chatbox_clear':
                    clearChatbox();
                    return ok();
                case 'chatbox_toggle':
                    setChatboxPaused(!chatboxPaused);
                    return ok();
                case 'chatbox_next':
                    holdUntil = 0;
                    chatboxTick(true);
                    return ok();
                case 'media':
                    return media.control(command.op) ? ok() : fail('Media controls are not running.');
                case 'send_osc': {
                    if (!isValidAddress(command.address)) return fail('OSC addresses start with "/".');
                    const args = argsFromPreviews(Array.isArray(command.args) ? command.args : []);
                    if (command.host || command.port) {
                        if (!isValidHost(command.host) || !isValidPort(command.port)) return fail('Invalid target.');
                        transport?.send(command.host, Number(command.port), command.address, args);
                        activity.record({
                            direction: EDirection.Out,
                            address: command.address,
                            args,
                            peer: `${command.host}:${command.port}`,
                        });
                    } else {
                        sendToVrchat(command.address, args, 'Test message');
                    }
                    return ok();
                }
                case 'reset_stats':
                    activity.reset();
                    publish({ type: 'state', requestId: null, payload: getState() });
                    return ok();
                case 'weather_refresh':
                    weather.refresh();
                    return ok();
                default:
                    return fail('Unknown command.');
            }
        },
        close() {
            if (closed) return;
            // Leave VRChat clean: a closed bot must not strand its last chatbox message.
            if (lastSentText && transport) sendChatInput('', false);
            closed = true;
            clearInterval(tickTimer);
            clearInterval(outputTimer);
            if (chatTimer) clearInterval(chatTimer);
            if (deliveryTimer) clearTimeout(deliveryTimer);
            for (const timer of timers) clearTimeout(timer);
            timers.clear();
            media.stop();
            system.stop();
            heartRate.stop();
            weather.stop();
            activity.close();
            const closing = transport;
            transport = null;
            setTimeout(() => closing?.close(), CLOSE_GRACE_MS).unref?.();
        },
    };
}

export type Engine = ReturnType<typeof createEngine>;

/** Trigger semantics for buttons: no args (impulse) or a truthy first argument. */
export function isTriggered(args: OscArg[]): boolean {
    if (args.length === 0) return true;
    const first = args[0];
    switch (first.type) {
        case 'T':
        case 'I':
            return true;
        case 'F':
        case 'N':
            return false;
        case 'f':
        case 'd':
            return first.value >= 0.5;
        case 's':
        case 'S':
            return !['', '0', 'false', 'off'].includes(first.value.trim().toLowerCase());
        default:
            return typeof first.value === 'number' ? first.value !== 0 : true;
    }
}

function ok() {
    return { ok: true, message: null };
}

function fail(message: string) {
    return { ok: false, message };
}
