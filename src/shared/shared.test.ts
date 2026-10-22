import { describe, expect, it } from 'vitest';

import { createDefaultConfig, ECondition, EOutputSource, EParamType, LIMITS, normalizeConfig } from './config';
import { emptyLiveState, type LiveState } from './protocol';
import { chatboxLength, conditionMet, fitChatbox, renderTemplate } from './template';

const now = new Date(2026, 9, 22, 21, 5, 9);

function live(patch: Partial<LiveState> = {}): LiveState {
    return { ...emptyLiveState(), ...patch };
}

describe('config normalization', () => {
    it('defaults garbage and keeps remote access off', () => {
        const config = normalizeConfig(null);
        expect(config.remote.allowLan).toBe(false);
        expect(config.osc.listenLan).toBe(false);
        expect(config.remote.token).toMatch(/^[a-f0-9]{24}$/);
    });

    it('drops invalid entries without rejecting the profile', () => {
        const config = normalizeConfig({
            osc: { listenPort: 99999, vrchatHost: 'bad host' },
            relays: [
                { host: '127.0.0.1', port: 9002 },
                { host: '', port: 1 },
            ],
            bindings: [{ address: 'nope' }, { address: '/a', action: 'explode' }],
            outputs: [{ address: '/avatar/parameters/HR', source: 'heart_rate', type: 'int' }],
            chatbox: { intervalSeconds: 0, messages: [{ text: 'hi', condition: 'weird' }] },
            remote: { token: 'short' },
        });
        expect(config.osc.listenPort).toBe(9001);
        expect(config.osc.vrchatHost).toBe('127.0.0.1');
        expect(config.relays).toHaveLength(1);
        expect(config.bindings).toHaveLength(1);
        expect(config.outputs[0]).toMatchObject({ source: EOutputSource.HeartRate, type: EParamType.Int });
        expect(config.chatbox.intervalSeconds).toBe(LIMITS.minIntervalSeconds);
        expect(config.chatbox.messages[0].condition).toBe(ECondition.Always);
        expect(config.remote.token).toMatch(/^[a-f0-9]{24}$/);
    });

    it('round-trips the defaults', () => {
        const defaults = createDefaultConfig();
        expect(normalizeConfig(JSON.parse(JSON.stringify(defaults)))).toEqual(defaults);
    });
});

describe('templates', () => {
    const music = {
        title: 'Song',
        artist: 'Band',
        album: 'LP',
        player: 'Spotify',
        playing: true,
        positionMs: 60_000,
        durationMs: 200_000,
        updatedAt: now.getTime(),
    };

    it('renders clock, music and system tokens', () => {
        const context = {
            now,
            seed: 0,
            live: live({
                music,
                system: {
                    cpu: 41.6,
                    ramPercent: 70,
                    ramUsedGb: 11.2,
                    ramTotalGb: 16,
                    gpu: 88,
                    gpuTemp: 65,
                    vramUsedGb: 6,
                    gpuName: 'GPU',
                },
            }),
        };
        expect(renderTemplate('{time} {time12} {date} {weekday}', context)).toBe('21:05 9:05 PM 2026-10-22 Thursday');
        expect(renderTemplate('♫ {song} — {artist} {song_position}/{song_duration}', context)).toBe('♫ Song — Band 1:00/3:20');
        expect(renderTemplate('{song_bar}', context)).toBe('━━━●───────');
        expect(renderTemplate('CPU {cpu}% RAM {ram}% GPU {gpu}% {gpu_temp}°', context)).toBe('CPU 42% RAM 70% GPU 88% 65°');
    });

    it('drops lines whose tokens are all empty', () => {
        const context = { now, seed: 0, live: live() };
        expect(renderTemplate('Hello\n♫ {song} — {artist}\n♥ {heart_rate}', context)).toBe('Hello');
        expect(renderTemplate('{nope} stays', context)).toBe('{nope} stays');
    });

    it('supports parametric tokens', () => {
        const context = { now, seed: 4, live: live({ params: { Mood: 3, Hat: true } }) };
        expect(renderTemplate('{random:a|b|c}', context)).toBe('b');
        expect(renderTemplate('{param:Mood} {param:Hat}', context)).toBe('3 true');
        expect(renderTemplate('{countdown:2026-10-23T21:05:09}', context)).toBe('1d 0:00');
        expect(renderTemplate('{time:UTC}', context)).toMatch(/^\d\d:\d\d$/);
    });

    it('fits VRChat limits and evaluates conditions', () => {
        expect(chatboxLength(fitChatbox('x'.repeat(300)))).toBe(LIMITS.chatboxMaxChars);
        expect(fitChatbox('1\n2\n3\n4\n5\n6\n7\n8\n9\n10').split('\n')).toHaveLength(LIMITS.chatboxMaxLines);
        expect(conditionMet(ECondition.MusicPlaying, live({ music }))).toBe(true);
        expect(conditionMet(ECondition.MusicPlaying, live())).toBe(false);
        expect(conditionMet(ECondition.Afk, live({ afk: true }))).toBe(true);
        expect(conditionMet(ECondition.HeartRate, live({ heartRate: 80 }))).toBe(true);
    });
});
