// The bot profile. It is persisted to disk by the engine and edited by the UI, so the
// right-hand side of every enum below is a storage format: do not rename it.

export enum ECondition {
    Always = 'always',
    MusicPlaying = 'music',
    NoMusic = 'no_music',
    Afk = 'afk',
    Active = 'active',
    HeartRate = 'heart_rate',
}

export enum EAction {
    ChatboxSend = 'chatbox_send',
    ChatboxToggle = 'chatbox_toggle',
    ChatboxNext = 'chatbox_next',
    ChatboxClear = 'chatbox_clear',
    MediaPlayPause = 'media_play_pause',
    MediaNext = 'media_next',
    MediaPrevious = 'media_previous',
    SendOsc = 'send_osc',
    AfkToggle = 'afk_toggle',
}

export enum EOutputSource {
    HeartRate = 'heart_rate',
    Cpu = 'cpu',
    Ram = 'ram',
    Gpu = 'gpu',
    Hour = 'hour',
    Minute = 'minute',
    Second = 'second',
    MusicPlaying = 'music_playing',
    MusicProgress = 'music_progress',
    Afk = 'afk',
}

export enum EParamType {
    Float = 'float',
    Int = 'int',
    Bool = 'bool',
}

export enum EHeartRateSource {
    Pulsoid = 'pulsoid',
    Osc = 'osc',
}

export enum ETemperatureUnit {
    Celsius = 'c',
    Fahrenheit = 'f',
}

export interface ChatMessage {
    id: string;
    enabled: boolean;
    text: string;
    condition: ECondition;
}

export interface Relay {
    id: string;
    name: string;
    enabled: boolean;
    host: string;
    port: number;
    /** OSC address pattern; `/*`-style wildcards. Empty forwards everything. */
    pattern: string;
}

export interface Binding {
    id: string;
    enabled: boolean;
    address: string;
    action: EAction;
    /** ChatboxSend: message template. */
    text: string;
    /** SendOsc: address, value and type to send to VRChat. */
    oscAddress: string;
    oscValue: number;
    oscType: EParamType;
}

export interface AvatarOutput {
    id: string;
    enabled: boolean;
    address: string;
    source: EOutputSource;
    type: EParamType;
}

export interface BotConfig {
    osc: {
        listenPort: number;
        /** Accept OSC from other devices on the network, not only this PC. */
        listenLan: boolean;
        vrchatHost: string;
        vrchatPort: number;
    };
    relays: Relay[];
    chatbox: {
        enabled: boolean;
        intervalSeconds: number;
        messages: ChatMessage[];
        /** Shown instead of the rotation while AFK; empty keeps rotating. */
        afkMessage: string;
        announceSongs: boolean;
        songTemplate: string;
        notifySound: boolean;
        typingIndicator: boolean;
        quickPhrases: string[];
    };
    media: { enabled: boolean };
    system: { enabled: boolean; gpu: boolean };
    heartRate: {
        enabled: boolean;
        source: EHeartRateSource;
        pulsoidToken: string;
        oscAddress: string;
        maxBpm: number;
    };
    weather: {
        enabled: boolean;
        city: string;
        unit: ETemperatureUnit;
    };
    afk: {
        useVrchat: boolean;
        useSystemIdle: boolean;
        idleMinutes: number;
    };
    bindings: Binding[];
    outputs: AvatarOutput[];
    remote: {
        port: number;
        /** Serve the control panel to phones on the network (token protected). */
        allowLan: boolean;
        token: string;
    };
    app: {
        startWithWindows: boolean;
        startMinimized: boolean;
        minimizeToTray: boolean;
    };
}

export const LIMITS = Object.freeze({
    chatboxMaxChars: 144,
    chatboxMaxLines: 9,
    /** VRChat silently drops chatbox messages that arrive faster than this. */
    chatboxMinSpacingMs: 1600,
    minIntervalSeconds: 2,
    maxIntervalSeconds: 60,
    maxMessages: 24,
    maxTemplateLength: 512,
    maxBindings: 128,
    maxOutputs: 64,
    maxRelays: 8,
    maxQuickPhrases: 16,
    maxAddressLength: 256,
    historySeconds: 60,
});

export const VRCHAT = Object.freeze({ host: '127.0.0.1', inputPort: 9000, outputPort: 9001 });
export const DEFAULT_REMOTE_PORT = 9876;

let sequence = 0;

export function createId(prefix: string): string {
    sequence = (sequence + 1) % 1_000_000;
    return `${prefix}${Date.now().toString(36)}${sequence.toString(36)}`;
}

export function createToken(): string {
    const bytes = new Uint8Array(12);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createMessage(text = '', condition = ECondition.Always): ChatMessage {
    return { id: createId('m'), enabled: true, text, condition };
}

export function createBinding(partial: Partial<Binding> = {}): Binding {
    return {
        id: createId('b'),
        enabled: true,
        address: '/avatar/parameters/BotButton',
        action: EAction.ChatboxSend,
        text: '',
        oscAddress: '/avatar/parameters/BotLight',
        oscValue: 1,
        oscType: EParamType.Bool,
        ...partial,
    };
}

export function createOutput(partial: Partial<AvatarOutput> = {}): AvatarOutput {
    return {
        id: createId('o'),
        enabled: true,
        address: '/avatar/parameters/HeartRate',
        source: EOutputSource.HeartRate,
        type: EParamType.Int,
        ...partial,
    };
}

export function createRelay(partial: Partial<Relay> = {}): Relay {
    return {
        id: createId('r'),
        name: 'Other OSC app',
        enabled: true,
        host: '127.0.0.1',
        port: 9002,
        pattern: '',
        ...partial,
    };
}

export function createDefaultConfig(): BotConfig {
    return {
        osc: {
            listenPort: VRCHAT.outputPort,
            listenLan: false,
            vrchatHost: VRCHAT.host,
            vrchatPort: VRCHAT.inputPort,
        },
        relays: [],
        chatbox: {
            enabled: true,
            intervalSeconds: 5,
            messages: [
                createMessage('◷ {time} · {weekday}'),
                createMessage('♫ {song} — {artist}\n{song_bar} {song_position}/{song_duration}', ECondition.MusicPlaying),
                createMessage('CPU {cpu}% · RAM {ram}% · GPU {gpu}%'),
                createMessage('♥ {heart_rate} bpm', ECondition.HeartRate),
            ],
            afkMessage: '💤 AFK for {afk_time}',
            announceSongs: true,
            songTemplate: '♫ Now playing: {song} — {artist}',
            notifySound: false,
            typingIndicator: false,
            quickPhrases: ['brb', 'Hi! 👋', 'Be right back', 'gg'],
        },
        media: { enabled: true },
        system: { enabled: true, gpu: true },
        heartRate: {
            enabled: false,
            source: EHeartRateSource.Pulsoid,
            pulsoidToken: '',
            oscAddress: '/avatar/parameters/HR',
            maxBpm: 200,
        },
        weather: { enabled: false, city: '', unit: ETemperatureUnit.Celsius },
        afk: { useVrchat: true, useSystemIdle: true, idleMinutes: 5 },
        bindings: [],
        outputs: [],
        remote: { port: DEFAULT_REMOTE_PORT, allowLan: false, token: createToken() },
        app: { startWithWindows: false, startMinimized: false, minimizeToTray: true },
    };
}

// ---- normalization -----------------------------------------------------------------------

const ADDRESS_PATTERN = /^\/[^\s#]*$/;
const HOST_PATTERN = /^[A-Za-z0-9.:\-[\]]+$/;

export function isValidAddress(value: unknown): value is string {
    return typeof value === 'string' && value.length <= LIMITS.maxAddressLength && ADDRESS_PATTERN.test(value);
}

export function isValidHost(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 253 && HOST_PATTERN.test(value);
}

export function isValidPort(value: unknown): boolean {
    const port = Number(value);
    return Number.isInteger(port) && port > 0 && port < 65536;
}

/**
 * Parses an untrusted profile (disk, websocket, pasted backup) into a complete one. Bad
 * entries are dropped or defaulted rather than rejecting the whole profile.
 */
export function normalizeConfig(raw: unknown): BotConfig {
    const defaults = createDefaultConfig();
    if (!isObject(raw)) return defaults;

    const ids = new Set<string>();
    const id = (value: unknown, prefix: string) => {
        let next = typeof value === 'string' ? value.trim().slice(0, 64) : '';
        if (!next || ids.has(next)) next = createId(prefix);
        ids.add(next);
        return next;
    };

    const osc = obj(raw.osc);
    const chat = obj(raw.chatbox);
    const heart = obj(raw.heartRate);
    const weather = obj(raw.weather);
    const afk = obj(raw.afk);
    const remote = obj(raw.remote);
    const app = obj(raw.app);
    const system = obj(raw.system);
    const media = obj(raw.media);

    return {
        osc: {
            listenPort: port(osc.listenPort, defaults.osc.listenPort),
            listenLan: bool(osc.listenLan, defaults.osc.listenLan),
            vrchatHost: isValidHost(osc.vrchatHost) ? osc.vrchatHost : defaults.osc.vrchatHost,
            vrchatPort: port(osc.vrchatPort, defaults.osc.vrchatPort),
        },
        relays: list(raw.relays, LIMITS.maxRelays)
            .filter((entry) => isValidHost(entry.host) && isValidPort(entry.port))
            .map((entry) => ({
                id: id(entry.id, 'r'),
                name: text(entry.name, 32) || String(entry.host),
                enabled: bool(entry.enabled, true),
                host: String(entry.host),
                port: Number(entry.port),
                pattern: isValidAddress(entry.pattern) ? entry.pattern : '',
            })),
        chatbox: {
            enabled: bool(chat.enabled, defaults.chatbox.enabled),
            intervalSeconds: clamp(
                Math.round(num(chat.intervalSeconds, defaults.chatbox.intervalSeconds)),
                LIMITS.minIntervalSeconds,
                LIMITS.maxIntervalSeconds,
            ),
            messages: Array.isArray(chat.messages)
                ? list(chat.messages, LIMITS.maxMessages).map((entry) => ({
                      id: id(entry.id, 'm'),
                      enabled: bool(entry.enabled, true),
                      text: template(entry.text),
                      condition: oneOf(ECondition, entry.condition, ECondition.Always),
                  }))
                : defaults.chatbox.messages,
            afkMessage: typeof chat.afkMessage === 'string' ? template(chat.afkMessage) : defaults.chatbox.afkMessage,
            announceSongs: bool(chat.announceSongs, defaults.chatbox.announceSongs),
            songTemplate: typeof chat.songTemplate === 'string' ? template(chat.songTemplate) : defaults.chatbox.songTemplate,
            notifySound: bool(chat.notifySound, defaults.chatbox.notifySound),
            typingIndicator: bool(chat.typingIndicator, defaults.chatbox.typingIndicator),
            quickPhrases: Array.isArray(chat.quickPhrases)
                ? chat.quickPhrases
                      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
                      .slice(0, LIMITS.maxQuickPhrases)
                      .map((entry) => entry.slice(0, LIMITS.chatboxMaxChars))
                : defaults.chatbox.quickPhrases,
        },
        media: { enabled: bool(media.enabled, defaults.media.enabled) },
        system: {
            enabled: bool(system.enabled, defaults.system.enabled),
            gpu: bool(system.gpu, defaults.system.gpu),
        },
        heartRate: {
            enabled: bool(heart.enabled, defaults.heartRate.enabled),
            source: oneOf(EHeartRateSource, heart.source, defaults.heartRate.source),
            pulsoidToken: text(heart.pulsoidToken, 128),
            oscAddress: isValidAddress(heart.oscAddress) ? heart.oscAddress : defaults.heartRate.oscAddress,
            maxBpm: clamp(Math.round(num(heart.maxBpm, defaults.heartRate.maxBpm)), 60, 250),
        },
        weather: {
            enabled: bool(weather.enabled, defaults.weather.enabled),
            city: text(weather.city, 80),
            unit: oneOf(ETemperatureUnit, weather.unit, defaults.weather.unit),
        },
        afk: {
            useVrchat: bool(afk.useVrchat, defaults.afk.useVrchat),
            useSystemIdle: bool(afk.useSystemIdle, defaults.afk.useSystemIdle),
            idleMinutes: clamp(Math.round(num(afk.idleMinutes, defaults.afk.idleMinutes)), 1, 120),
        },
        bindings: list(raw.bindings, LIMITS.maxBindings)
            .filter((entry) => isValidAddress(entry.address))
            .map((entry) => ({
                id: id(entry.id, 'b'),
                enabled: bool(entry.enabled, true),
                address: String(entry.address),
                action: oneOf(EAction, entry.action, EAction.ChatboxSend),
                text: template(entry.text),
                oscAddress: isValidAddress(entry.oscAddress) ? entry.oscAddress : '/avatar/parameters/BotLight',
                oscValue: num(entry.oscValue, 1),
                oscType: oneOf(EParamType, entry.oscType, EParamType.Bool),
            })),
        outputs: list(raw.outputs, LIMITS.maxOutputs)
            .filter((entry) => isValidAddress(entry.address))
            .map((entry) => ({
                id: id(entry.id, 'o'),
                enabled: bool(entry.enabled, true),
                address: String(entry.address),
                source: oneOf(EOutputSource, entry.source, EOutputSource.HeartRate),
                type: oneOf(EParamType, entry.type, EParamType.Float),
            })),
        remote: {
            port: port(remote.port, defaults.remote.port),
            allowLan: bool(remote.allowLan, defaults.remote.allowLan),
            token: typeof remote.token === 'string' && /^[a-f0-9]{16,64}$/.test(remote.token) ? remote.token : defaults.remote.token,
        },
        app: {
            startWithWindows: bool(app.startWithWindows, defaults.app.startWithWindows),
            startMinimized: bool(app.startMinimized, defaults.app.startMinimized),
            minimizeToTray: bool(app.minimizeToTray, defaults.app.minimizeToTray),
        },
    };
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function obj(value: unknown): Record<string, unknown> {
    return isObject(value) ? value : {};
}

function list(value: unknown, max: number): Record<string, unknown>[] {
    return Array.isArray(value) ? value.filter(isObject).slice(0, max) : [];
}

function bool(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function num(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function port(value: unknown, fallback: number): number {
    return isValidPort(value) ? Number(value) : fallback;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function text(value: unknown, max: number): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function template(value: unknown): string {
    return typeof value === 'string' ? value.slice(0, LIMITS.maxTemplateLength) : '';
}

function oneOf<T extends string>(options: Record<string, T>, value: unknown, fallback: T): T {
    return Object.values(options).includes(value as T) ? (value as T) : fallback;
}
