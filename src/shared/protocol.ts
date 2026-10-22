// Messages between the engine (Node / Electron main) and the UI (window, phone browser).
import type { BotConfig, ETemperatureUnit } from './config';

export const PROTOCOL_VERSION = 1;
export const WS_PATH = '/ws';

export enum EOscState {
    Starting = 'starting',
    Listening = 'listening',
    /** The listen port is taken; sending (chatbox, avatar sync) still works. */
    SendOnly = 'send_only',
    Error = 'error',
}

export enum EDirection {
    In = 'in',
    Out = 'out',
    Error = 'error',
}

export enum EProviderState {
    Off = 'off',
    Starting = 'starting',
    Ok = 'ok',
    Unsupported = 'unsupported',
    Error = 'error',
}

export type MusicState = {
    title: string;
    artist: string;
    album: string;
    player: string;
    playing: boolean;
    positionMs: number;
    durationMs: number;
    /** Epoch ms at which `positionMs` was measured. */
    updatedAt: number;
};

export type SystemState = {
    cpu: number | null;
    ramPercent: number | null;
    ramUsedGb: number | null;
    ramTotalGb: number | null;
    gpu: number | null;
    gpuTemp: number | null;
    vramUsedGb: number | null;
    gpuName: string | null;
};

export type WeatherState = {
    place: string;
    temperature: number;
    unit: ETemperatureUnit;
    icon: string;
    label: string;
    updatedAt: number;
};

export type ProviderStatus = { state: EProviderState; detail: string | null };

export type LiveState = {
    uptimeSeconds: number;
    music: MusicState | null;
    system: SystemState | null;
    heartRate: number | null;
    weather: WeatherState | null;
    afk: boolean;
    afkSeconds: number;
    muted: boolean | null;
    avatarId: string | null;
    /** Latest values VRChat reported for avatar parameters. */
    params: Record<string, number | boolean | string>;
    providers: {
        media: ProviderStatus;
        system: ProviderStatus;
        heartRate: ProviderStatus;
        weather: ProviderStatus;
    };
};

export type TrafficSample = { in: number; out: number };

export type BotStatus = {
    osc: EOscState;
    listenAddress: string | null;
    error: string | null;
    startedAt: string;
    packetsIn: number;
    packetsOut: number;
    errors: number;
    history: TrafficSample[];
    chatboxPaused: boolean;
    lastChatbox: string | null;
    lastChatboxAt: string | null;
    vrchatSeenAt: string | null;
};

export type ArgPreview = { type: string; value: string | number | boolean | null };

export type ActivityEntry = {
    id: number;
    at: number;
    direction: EDirection;
    address: string;
    args: ArgPreview[];
    peer: string;
    count: number;
    note?: string | null;
    failed?: boolean;
    bindingId?: string | null;
};

export type HostInfo = {
    kind: 'electron' | 'standalone';
    version: string;
    platform: string;
    /** URLs a phone can open (LAN addresses, token included) when remote access is on. */
    remoteUrls: string[];
};

export type StatePayload = {
    config: BotConfig;
    status: BotStatus;
    live: LiveState;
    activity: ActivityEntry[];
    host: HostInfo;
};

export type MediaOperation = 'play_pause' | 'next' | 'previous';

export type Command =
    | { action: 'chatbox_send'; text: string }
    | { action: 'chatbox_clear' }
    | { action: 'chatbox_toggle' }
    | { action: 'chatbox_next' }
    | { action: 'media'; op: MediaOperation }
    | { action: 'send_osc'; address: string; args: ArgPreview[]; host?: string; port?: number }
    | { action: 'reset_stats' }
    | { action: 'weather_refresh' };

export type ServerMessage =
    | { type: 'state'; requestId: string | null; payload: StatePayload }
    | { type: 'tick'; payload: { status: BotStatus; live: LiveState } }
    | { type: 'activity'; payload: { entries: ActivityEntry[] } }
    | { type: 'result'; requestId: string | null; payload: { ok: boolean; action: string; message: string | null } };

export type ClientMessage =
    | { type: 'hello'; version: number }
    | { type: 'config'; requestId: string; payload: { config: BotConfig } }
    | { type: 'command'; requestId: string; payload: Command };

export function emptyLiveState(): LiveState {
    const off = { state: EProviderState.Off, detail: null };
    return {
        uptimeSeconds: 0,
        music: null,
        system: null,
        heartRate: null,
        weather: null,
        afk: false,
        afkSeconds: 0,
        muted: null,
        avatarId: null,
        params: {},
        providers: { media: off, system: off, heartRate: off, weather: off },
    };
}
