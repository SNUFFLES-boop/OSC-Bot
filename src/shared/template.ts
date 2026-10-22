// Chatbox templates are rendered by the engine (what VRChat receives) and by the UI (the
// live preview), so both share this one implementation.
import { ECondition, LIMITS } from './config';
import type { LiveState } from './protocol';

export type TokenGroup = 'time' | 'music' | 'system' | 'body' | 'world' | 'vrchat';

export const TOKENS: { token: string; group: TokenGroup; label: string }[] = [
    { token: 'time', group: 'time', label: 'Clock' },
    { token: 'time12', group: 'time', label: 'Clock 12h' },
    { token: 'time_s', group: 'time', label: 'Clock + sec' },
    { token: 'date', group: 'time', label: 'Date' },
    { token: 'weekday', group: 'time', label: 'Weekday' },
    { token: 'uptime', group: 'time', label: 'Bot uptime' },
    { token: 'song', group: 'music', label: 'Song' },
    { token: 'artist', group: 'music', label: 'Artist' },
    { token: 'album', group: 'music', label: 'Album' },
    { token: 'player', group: 'music', label: 'Player app' },
    { token: 'playing', group: 'music', label: 'Play icon' },
    { token: 'song_bar', group: 'music', label: 'Progress bar' },
    { token: 'song_position', group: 'music', label: 'Position' },
    { token: 'song_duration', group: 'music', label: 'Duration' },
    { token: 'cpu', group: 'system', label: 'CPU %' },
    { token: 'ram', group: 'system', label: 'RAM %' },
    { token: 'ram_used', group: 'system', label: 'RAM used' },
    { token: 'gpu', group: 'system', label: 'GPU %' },
    { token: 'gpu_temp', group: 'system', label: 'GPU °C' },
    { token: 'vram', group: 'system', label: 'VRAM used' },
    { token: 'heart_rate', group: 'body', label: 'Heart rate' },
    { token: 'heart', group: 'body', label: 'Heart icon' },
    { token: 'afk', group: 'body', label: 'AFK tag' },
    { token: 'afk_time', group: 'body', label: 'AFK time' },
    { token: 'weather', group: 'world', label: 'Weather' },
    { token: 'temp', group: 'world', label: 'Temperature' },
    { token: 'place', group: 'world', label: 'Place' },
    { token: 'muted', group: 'vrchat', label: 'Mic muted' },
    { token: 'speed', group: 'vrchat', label: 'Speed m/s' },
];

/** Parametric tokens: `{time:Asia/Tokyo}`, `{param:Name}`, `{random:a|b|c}`, `{countdown:2026-12-31}`. */
export const PARAMETRIC_TOKENS = ['time', 'param', 'random', 'countdown'] as const;

export type TemplateContext = {
    now: Date;
    live: LiveState;
    /** Changes per rotation step so `{random:…}` is stable within one message. */
    seed: number;
};

const TOKEN_PATTERN = /\{([a-z0-9_]+)(?::([^{}]*))?\}/gi;
const BAR_SEGMENTS = 10;

/**
 * Renders a template and fits it to VRChat's chatbox. A line whose tokens all came out
 * empty (no song playing, no heart-rate sensor…) is dropped instead of leaving a stub.
 */
export function renderTemplate(template: string, context: TemplateContext): string {
    const lines = template.replace(/\r\n?/g, '\n').split('\n');
    const rendered: string[] = [];

    for (const line of lines) {
        let tokens = 0;
        let empty = 0;
        const out = line.replace(TOKEN_PATTERN, (match, rawName: string, arg?: string) => {
            const value = resolveToken(rawName.toLowerCase(), arg, context);
            if (value === null) return match;
            tokens += 1;
            if (!value) empty += 1;
            return value;
        });
        if (tokens > 0 && empty === tokens) continue;
        rendered.push(out);
    }

    return fitChatbox(rendered.join('\n'));
}

export function fitChatbox(text: string): string {
    const lines = text.split('\n').map((line) => line.replace(/\s+$/, ''));
    while (lines.length > 0 && !lines[lines.length - 1]) lines.pop();
    const joined = lines.slice(0, LIMITS.chatboxMaxLines).join('\n');
    const chars = Array.from(joined);
    return chars.length <= LIMITS.chatboxMaxChars ? joined : `${chars.slice(0, LIMITS.chatboxMaxChars - 1).join('')}…`;
}

export function chatboxLength(text: string): number {
    return Array.from(text).length;
}

export function conditionMet(condition: ECondition, live: LiveState): boolean {
    switch (condition) {
        case ECondition.MusicPlaying:
            return Boolean(live.music?.playing && live.music.title);
        case ECondition.NoMusic:
            return !live.music?.playing;
        case ECondition.Afk:
            return live.afk;
        case ECondition.Active:
            return !live.afk;
        case ECondition.HeartRate:
            return live.heartRate !== null;
        default:
            return true;
    }
}

export function formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/** Media positions are reported at a point in time; extrapolate while playing. */
export function musicPositionMs(music: LiveState['music'], now: number): number {
    if (!music) return 0;
    const elapsed = music.playing ? Math.max(0, now - music.updatedAt) : 0;
    const position = music.positionMs + elapsed;
    return music.durationMs > 0 ? Math.min(position, music.durationMs) : position;
}

function resolveToken(name: string, arg: string | undefined, { now, live, seed }: TemplateContext): string | null {
    if (arg !== undefined) {
        return resolveParametric(name, arg, now, live, seed);
    }

    const music = live.music;
    const system = live.system;
    switch (name) {
        case 'time':
            return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        case 'time12': {
            const hours = now.getHours();
            return `${hours % 12 || 12}:${pad(now.getMinutes())} ${hours < 12 ? 'AM' : 'PM'}`;
        }
        case 'time_s':
            return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        case 'date':
            return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        case 'weekday':
            return now.toLocaleDateString('en-US', { weekday: 'long' });
        case 'uptime':
            return formatDuration(live.uptimeSeconds);
        case 'song':
            return music?.title ?? '';
        case 'artist':
            return music?.artist ?? '';
        case 'album':
            return music?.album ?? '';
        case 'player':
            return music?.player ?? '';
        case 'playing':
            return music ? (music.playing ? '▶' : '⏸') : '';
        case 'song_bar': {
            if (!music?.durationMs) return '';
            const ratio = musicPositionMs(music, now.getTime()) / music.durationMs;
            const filled = Math.round(Math.min(1, ratio) * BAR_SEGMENTS);
            return `${'━'.repeat(filled)}●${'─'.repeat(BAR_SEGMENTS - filled)}`;
        }
        case 'song_position':
            return music ? formatDuration(musicPositionMs(music, now.getTime()) / 1000) : '';
        case 'song_duration':
            return music?.durationMs ? formatDuration(music.durationMs / 1000) : '';
        case 'cpu':
            return system?.cpu == null ? '' : String(Math.round(system.cpu));
        case 'ram':
            return system?.ramPercent == null ? '' : String(Math.round(system.ramPercent));
        case 'ram_used':
            return system?.ramUsedGb == null ? '' : `${system.ramUsedGb.toFixed(1)} GB`;
        case 'gpu':
            return system?.gpu == null ? '' : String(Math.round(system.gpu));
        case 'gpu_temp':
            return system?.gpuTemp == null ? '' : String(Math.round(system.gpuTemp));
        case 'vram':
            return system?.vramUsedGb == null ? '' : `${system.vramUsedGb.toFixed(1)} GB`;
        case 'heart_rate':
            return live.heartRate === null ? '' : String(live.heartRate);
        case 'heart':
            return live.heartRate === null ? '' : now.getSeconds() % 2 ? '♥' : '♡';
        case 'afk':
            return live.afk ? 'AFK' : '';
        case 'afk_time':
            return live.afk ? formatDuration(live.afkSeconds) : '';
        case 'weather':
            return live.weather ? `${live.weather.icon} ${live.weather.label}` : '';
        case 'temp':
            return live.weather ? `${Math.round(live.weather.temperature)}°${live.weather.unit.toUpperCase()}` : '';
        case 'place':
            return live.weather?.place ?? '';
        case 'muted':
            return live.muted ? '🔇' : '';
        case 'speed': {
            const speed = live.params.VelocityMagnitude;
            return typeof speed === 'number' ? speed.toFixed(1) : '';
        }
        default:
            return null;
    }
}

function resolveParametric(name: string, arg: string, now: Date, live: LiveState, seed: number): string | null {
    switch (name) {
        case 'time':
            try {
                return now.toLocaleTimeString('en-GB', {
                    timeZone: arg.trim(),
                    hour: '2-digit',
                    minute: '2-digit',
                });
            } catch {
                return '?';
            }
        case 'param': {
            const value = live.params[arg.trim()];
            if (value === undefined) return '';
            return typeof value === 'number' ? String(Math.round(value * 100) / 100) : String(value);
        }
        case 'random': {
            const options = arg.split('|');
            return options[Math.abs(seed) % options.length] ?? '';
        }
        case 'countdown': {
            const target = Date.parse(arg.trim());
            if (!Number.isFinite(target)) return '?';
            const seconds = Math.max(0, (target - now.getTime()) / 1000);
            const days = Math.floor(seconds / 86400);
            return days > 0 ? `${days}d ${formatDuration(seconds % 86400)}` : formatDuration(seconds);
        }
        default:
            return null;
    }
}

function pad(value: number): string {
    return String(value).padStart(2, '0');
}
