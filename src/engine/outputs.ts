import { type AvatarOutput, EOutputSource, EParamType } from '../shared/config';
import type { LiveState } from '../shared/protocol';
import { musicPositionMs } from '../shared/template';
import type { OscArg } from './osc/codec';

type Reading = {
    /** Natural value: bpm, percent, hour… */
    raw: number;
    /** 0..1 form for float parameters (VRChat floats are -1..1). */
    unit: number;
};

/**
 * The value an avatar parameter receives for a live source. Floats are normalized to 0..1
 * (clock floats are smooth, e.g. 14:30 → hour 0.604), ints carry the natural value
 * (bpm, hour, percent) and bools are "is it on". Null when the source has no reading.
 */
export function readOutput(source: EOutputSource, live: LiveState, now: Date, maxBpm: number): Reading | null {
    const system = live.system;
    const percent = (value: number | null | undefined) => (value == null ? null : { raw: value, unit: clamp01(value / 100) });

    switch (source) {
        case EOutputSource.HeartRate:
            return live.heartRate === null ? null : { raw: live.heartRate, unit: clamp01(live.heartRate / maxBpm) };
        case EOutputSource.Cpu:
            return percent(system?.cpu);
        case EOutputSource.Ram:
            return percent(system?.ramPercent);
        case EOutputSource.Gpu:
            return percent(system?.gpu);
        case EOutputSource.Hour: {
            const hours = now.getHours() + now.getMinutes() / 60;
            return { raw: now.getHours(), unit: hours / 24 };
        }
        case EOutputSource.Minute: {
            const minutes = now.getMinutes() + now.getSeconds() / 60;
            return { raw: now.getMinutes(), unit: minutes / 60 };
        }
        case EOutputSource.Second:
            return { raw: now.getSeconds(), unit: now.getSeconds() / 60 };
        case EOutputSource.MusicPlaying: {
            const playing = live.music?.playing ? 1 : 0;
            return { raw: playing, unit: playing };
        }
        case EOutputSource.MusicProgress: {
            const music = live.music;
            if (!music?.durationMs) return null;
            const progress = clamp01(musicPositionMs(music, now.getTime()) / music.durationMs);
            return { raw: Math.round(progress * 100), unit: progress };
        }
        case EOutputSource.Afk: {
            const afk = live.afk ? 1 : 0;
            return { raw: afk, unit: afk };
        }
        default:
            return null;
    }
}

export function outputArgs(output: AvatarOutput, live: LiveState, now: Date, maxBpm: number): OscArg[] | null {
    const reading = readOutput(output.source, live, now, maxBpm);
    if (!reading) return null;
    switch (output.type) {
        case EParamType.Bool:
            return [reading.raw > 0 ? { type: 'T', value: true } : { type: 'F', value: false }];
        case EParamType.Int:
            return [{ type: 'i', value: Math.round(reading.raw) }];
        default:
            return [{ type: 'f', value: Math.round(reading.unit * 10000) / 10000 }];
    }
}

export function paramArgs(value: number, type: EParamType): OscArg[] {
    if (type === EParamType.Bool) return [value > 0 ? { type: 'T', value: true } : { type: 'F', value: false }];
    if (type === EParamType.Int) return [{ type: 'i', value: Math.round(value) }];
    return [{ type: 'f', value }];
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}
