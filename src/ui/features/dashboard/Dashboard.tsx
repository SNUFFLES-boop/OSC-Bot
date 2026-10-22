import { type FormEvent, useState } from 'react';

import { cn } from '@/shared/lib/ui';
import { useNow } from '@/shared/lib/use-now';
import { INPUT_CLASS } from '@/shared/ui/CommitInput';
import { Icon } from '@/shared/ui/Icon';
import { IconButton } from '@/shared/ui/IconButton';
import { Switch } from '@/shared/ui/Switch';
import { LIMITS } from '../../../shared/config';
import { EOscState, EProviderState, type LiveState, type MusicState } from '../../../shared/protocol';
import { formatDuration, musicPositionMs } from '../../../shared/template';
import type { SectionProps } from '../../app/section-props';
import { TrafficSparkline } from './TrafficSparkline';

const STATE_TEXT: Record<EOscState, { label: string; tone: string }> = {
    [EOscState.Starting]: { label: 'Starting…', tone: 'text-amber-300' },
    [EOscState.Listening]: { label: 'Online', tone: 'text-(--deck-accent)' },
    [EOscState.SendOnly]: { label: 'Send only', tone: 'text-amber-300' },
    [EOscState.Error]: { label: 'Error', tone: 'text-red-300' },
};

export const Dashboard = ({ config, status, live, update, command }: SectionProps) => {
    const now = useNow(1000);
    const vrchatSeen = status.vrchatSeenAt ? now.getTime() - Date.parse(status.vrchatSeenAt) < 30000 : false;

    return (
        <div className="space-y-3">
            <Hero
                status={status}
                vrchatSeen={vrchatSeen}
                chatboxOn={config.chatbox.enabled && !status.chatboxPaused}
                onChatbox={(on) => {
                    if (!config.chatbox.enabled)
                        update((current) => ({ ...current, chatbox: { ...current.chatbox, enabled: true } }), true);
                    if (status.chatboxPaused === on) command({ action: 'chatbox_toggle' });
                }}
                onReset={() => command({ action: 'reset_stats' })}
            />
            <QuickSend phrases={config.chatbox.quickPhrases} lastSent={status.lastChatbox} command={command} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NowPlayingTile live={live} enabled={config.media.enabled} now={now} command={command} />
                <SystemTile live={live} enabled={config.system.enabled} />
                <HeartTile live={live} enabled={config.heartRate.enabled} />
                <ClockTile live={live} now={now} weatherOn={config.weather.enabled} />
            </div>
        </div>
    );
};

const Hero = ({
    status,
    vrchatSeen,
    chatboxOn,
    onChatbox,
    onReset,
}: {
    status: SectionProps['status'];
    vrchatSeen: boolean;
    chatboxOn: boolean;
    onChatbox: (on: boolean) => void;
    onReset: () => void;
}) => {
    const state = STATE_TEXT[status.osc];
    const listening = status.osc === EOscState.Listening;

    return (
        <section className="relative overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(140deg,color-mix(in_oklab,var(--deck-accent)_15%,rgba(18,21,29,.92)),rgba(12,14,20,.92)_58%)] p-4 shadow-[0_24px_60px_-30px_color-mix(in_oklab,var(--deck-accent)_55%,transparent),inset_0_1px_0_rgba(255,255,255,.07)]">
            <div className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--deck-accent)_24%,transparent),transparent_65%)]" />
            <div className="relative flex flex-wrap items-center gap-4">
                <div className="relative size-16 shrink-0">
                    {listening ? <span className="osc-orb-ring absolute -inset-1 rounded-full motion-reduce:animate-none" /> : null}
                    {status.packetsIn > 0 ? (
                        <span
                            key={`in-${status.packetsIn}`}
                            className="absolute inset-0 rounded-full border-2 border-(--deck-accent) opacity-0 motion-safe:animate-[osc-ripple_900ms_ease-out]"
                        />
                    ) : null}
                    {status.packetsOut > 0 ? (
                        <span
                            key={`out-${status.packetsOut}`}
                            className="absolute inset-0 rounded-full border-2 border-violet-400 opacity-0 motion-safe:animate-[osc-ripple_1100ms_ease-out]"
                        />
                    ) : null}
                    <span
                        className={cn(
                            'absolute inset-0 flex items-center justify-center rounded-full border',
                            listening
                                ? 'border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)] bg-[radial-gradient(circle_at_35%_30%,color-mix(in_oklab,var(--deck-accent)_45%,transparent),rgba(10,12,18,.9)_70%)] text-(--deck-accent) shadow-[0_0_30px_-4px_var(--deck-accent)]'
                                : 'border-amber-300/40 bg-amber-400/10 text-amber-300',
                        )}
                    >
                        <Icon className="size-7" name="broadcast" stroke={1.6} />
                    </span>
                </div>
                <div className="min-w-0 flex-1">
                    <div className="font-mono text-[9.5px] font-bold tracking-[0.2em] text-(--deck-fg-4)">OSC BOT</div>
                    <h1 className={cn('text-[22px] font-bold leading-tight', state.tone)}>{state.label}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-(--deck-fg-3)">
                        <span>UDP {status.listenAddress ?? '—'}</span>
                        <span className={cn('flex items-center gap-1.5', vrchatSeen ? 'text-(--deck-accent)' : '')}>
                            <span className={cn('size-1.5 rounded-full', vrchatSeen ? 'bg-(--deck-accent)' : 'bg-white/25')} />
                            {vrchatSeen ? 'VRChat connected' : 'Waiting for VRChat'}
                        </span>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5 rounded-full border border-white/10 bg-black/25 py-1.5 pl-3.5 pr-1.5">
                    <span aria-hidden="true" className="text-[12px] font-semibold text-(--deck-fg-2)">
                        Chatbox
                    </span>
                    <Switch checked={chatboxOn} label="Chatbox" onChange={onChatbox} />
                </div>
            </div>
            {status.error ? (
                <div className="relative mt-3 flex items-start gap-2 rounded-[10px] border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-[12px] leading-5 text-amber-100">
                    <Icon className="mt-0.5 size-3.5 shrink-0" name="alert" />
                    <span>{status.error}</span>
                </div>
            ) : null}
            <div className="relative mt-3.5 grid grid-cols-3 gap-2">
                <Stat label="In" value={status.packetsIn} tone="text-(--deck-accent)" />
                <Stat label="Out" value={status.packetsOut} tone="text-violet-300" />
                <Stat label="Errors" value={status.errors} tone={status.errors ? 'text-red-300' : 'text-(--deck-fg)'} />
            </div>
            <div className="relative mt-2.5">
                <TrafficSparkline
                    history={status.history}
                    action={
                        <button
                            type="button"
                            className="rounded px-1 font-mono text-[9.5px] font-bold uppercase tracking-[0.1em] text-(--deck-fg-4) hover:text-(--deck-fg-2)"
                            onClick={onReset}
                        >
                            Reset
                        </button>
                    }
                />
            </div>
        </section>
    );
};

const Stat = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
    <div className="rounded-[12px] border border-white/8 bg-black/20 px-2.5 py-2">
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-(--deck-fg-4)">{label}</div>
        <div
            key={value}
            className={cn('mt-0.5 font-mono text-[17px] font-bold tabular-nums motion-safe:animate-[osc-rise_220ms_ease-out]', tone)}
        >
            {value < 10000 ? value.toLocaleString('en-US') : `${(value / 1000).toFixed(1)}k`}
        </div>
    </div>
);

const QuickSend = ({ phrases, lastSent, command }: { phrases: string[]; lastSent: string | null; command: SectionProps['command'] }) => {
    const [text, setText] = useState('');
    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (text.trim() && command({ action: 'chatbox_send', text })) setText('');
    };

    return (
        <section className="rounded-[18px] border border-white/10 bg-white/3.5 p-3">
            <form className="flex gap-2" onSubmit={submit}>
                <input
                    value={text}
                    maxLength={LIMITS.maxTemplateLength}
                    placeholder="Say something in the chatbox… ({time}, {song} work too)"
                    aria-label="Chatbox message"
                    className={INPUT_CLASS}
                    onInput={(event) => setText(event.currentTarget.value)}
                />
                <button
                    type="submit"
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] bg-(--deck-accent) px-4 text-[12.5px] font-bold text-black shadow-[0_8px_24px_-10px_var(--deck-accent)] active:scale-[0.97]"
                >
                    <Icon className="size-3.5" name="send" stroke={2.2} />
                    Send
                </button>
                <IconButton size="lg" icon="skip-next" label="Next rotation message" onClick={() => command({ action: 'chatbox_next' })} />
                <IconButton size="lg" icon="x" label="Clear chatbox" onClick={() => command({ action: 'chatbox_clear' })} />
            </form>
            {phrases.length ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {phrases.map((phrase) => (
                        <button
                            key={phrase}
                            type="button"
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] font-medium text-(--deck-fg-2) transition-all hover:border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)] hover:text-(--deck-accent) active:scale-95"
                            onClick={() => command({ action: 'chatbox_send', text: phrase })}
                        >
                            {phrase}
                        </button>
                    ))}
                </div>
            ) : null}
            <div className="mt-2.5 truncate font-mono text-[10.5px] text-(--deck-fg-4)">
                Last sent: {lastSent ? lastSent.replace(/\n/g, ' ⏎ ') : lastSent === '' ? '(cleared)' : '—'}
            </div>
        </section>
    );
};

const Tile = ({
    icon,
    title,
    children,
    state,
    className,
}: {
    icon: Parameters<typeof Icon>[0]['name'];
    title: string;
    children: React.ReactNode;
    state?: string | null;
    className?: string;
}) => (
    <section className={cn('relative overflow-hidden rounded-[18px] border border-white/10 bg-white/3.5 p-4', className)}>
        <div className="mb-3 flex items-center gap-2">
            <Icon className="size-4 text-(--deck-accent)" name={icon} />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-(--deck-fg-4)">{title}</span>
            {state ? <span className="ml-auto truncate text-[10.5px] text-(--deck-fg-4)">{state}</span> : null}
        </div>
        {children}
    </section>
);

const NowPlayingTile = ({
    live,
    enabled,
    now,
    command,
}: {
    live: LiveState;
    enabled: boolean;
    now: Date;
    command: SectionProps['command'];
}) => {
    const music = live.music;
    const provider = live.providers.media;
    const note = !enabled
        ? 'Off in Sources'
        : provider.state === EProviderState.Unsupported
          ? 'Windows only'
          : provider.state === EProviderState.Error
            ? 'Retrying…'
            : null;

    return (
        <Tile icon="music" title="Now playing" state={music?.player ?? note}>
            {music ? (
                <MusicInfo music={music} now={now} />
            ) : (
                <p className="py-3 text-[13px] text-(--deck-fg-3)">{enabled ? 'Nothing is playing.' : 'Music is turned off.'}</p>
            )}
            <div className="mt-3 flex items-center justify-center gap-2">
                <IconButton icon="skip-prev" label="Previous track" onClick={() => command({ action: 'media', op: 'previous' })} />
                <button
                    type="button"
                    aria-label="Play or pause"
                    className="flex size-11 items-center justify-center rounded-full bg-(--deck-accent) text-black shadow-[0_8px_24px_-8px_var(--deck-accent)] active:scale-95"
                    onClick={() => command({ action: 'media', op: 'play_pause' })}
                >
                    <Icon className="size-5" name={music?.playing ? 'pause' : 'play'} stroke={2.4} />
                </button>
                <IconButton icon="skip-next" label="Next track" onClick={() => command({ action: 'media', op: 'next' })} />
            </div>
        </Tile>
    );
};

const MusicInfo = ({ music, now }: { music: MusicState; now: Date }) => {
    const position = musicPositionMs(music, now.getTime());
    const ratio = music.durationMs ? Math.min(1, position / music.durationMs) : 0;
    return (
        <div>
            <div className="flex items-center gap-3">
                <div className="flex h-8 shrink-0 items-end gap-0.5" aria-hidden="true">
                    {[0, 1, 2, 3].map((bar) => (
                        <span
                            key={bar}
                            className={cn(
                                'block w-1 origin-bottom rounded-full bg-(--deck-accent)',
                                music.playing ? 'h-8 motion-safe:animate-[osc-eq_900ms_ease-in-out_infinite]' : 'h-2',
                            )}
                            style={{ animationDelay: `${bar * 140}ms` }}
                        />
                    ))}
                </div>
                <div className="min-w-0">
                    <div className="truncate text-[15px] font-semibold text-(--deck-fg)">{music.title}</div>
                    <div className="truncate text-[12.5px] text-(--deck-fg-3)">
                        {[music.artist, music.album].filter(Boolean).join(' · ')}
                    </div>
                </div>
            </div>
            {music.durationMs ? (
                <div className="mt-3">
                    <div className="h-1 overflow-hidden rounded-full bg-white/8">
                        <div
                            className="h-full rounded-full bg-(--deck-accent) transition-[width] duration-1000 ease-linear"
                            style={{ width: `${ratio * 100}%` }}
                        />
                    </div>
                    <div className="mt-1 flex justify-between font-mono text-[10px] text-(--deck-fg-4)">
                        <span>{formatDuration(position / 1000)}</span>
                        <span>{formatDuration(music.durationMs / 1000)}</span>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

const SystemTile = ({ live, enabled }: { live: LiveState; enabled: boolean }) => {
    const system = live.system;
    return (
        <Tile icon="cpu" title="PC stats" state={system?.gpuName ?? (enabled ? null : 'Off in Sources')}>
            <div className="grid grid-cols-3 gap-2">
                <Gauge label="CPU" value={system?.cpu ?? null} />
                <Gauge
                    label="RAM"
                    value={system?.ramPercent ?? null}
                    detail={system?.ramUsedGb ? `${system.ramUsedGb.toFixed(1)} GB` : null}
                />
                <Gauge label="GPU" value={system?.gpu ?? null} detail={system?.gpuTemp ? `${Math.round(system.gpuTemp)}°C` : null} />
            </div>
        </Tile>
    );
};

const GAUGE_RADIUS = 26;
const GAUGE_LENGTH = 2 * Math.PI * GAUGE_RADIUS;

const Gauge = ({ label, value, detail }: { label: string; value: number | null; detail?: string | null }) => {
    const ratio = value === null ? 0 : Math.min(1, value / 100);
    const hot = ratio > 0.85;
    return (
        <div className="flex flex-col items-center">
            <div className="relative size-18">
                <svg aria-hidden="true" className="size-full -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r={GAUGE_RADIUS} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="6" />
                    <circle
                        cx="32"
                        cy="32"
                        r={GAUGE_RADIUS}
                        fill="none"
                        stroke={hot ? '#f87171' : 'var(--deck-accent)'}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={GAUGE_LENGTH}
                        strokeDashoffset={GAUGE_LENGTH * (1 - ratio)}
                        className="transition-[stroke-dashoffset] duration-700 ease-out"
                    />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center font-mono text-[14px] font-bold tabular-nums text-(--deck-fg)">
                    {value === null ? '—' : `${Math.round(value)}%`}
                </span>
            </div>
            <span className="mt-1 font-mono text-[10px] font-bold tracking-[0.12em] text-(--deck-fg-3)">{label}</span>
            <span className="h-3.5 font-mono text-[9.5px] text-(--deck-fg-4)">{detail ?? ''}</span>
        </div>
    );
};

const HeartTile = ({ live, enabled }: { live: LiveState; enabled: boolean }) => {
    const bpm = live.heartRate;
    const provider = live.providers.heartRate;
    const beat = bpm ? 60 / bpm : 1;
    return (
        <Tile icon="heart" title="Heart rate" state={enabled ? provider.detail : 'Off in Sources'}>
            <div className="flex items-center gap-4 py-1">
                <span
                    className={cn(
                        'text-[44px] leading-none',
                        bpm ? 'text-rose-400 motion-safe:animate-[osc-heartbeat_1s_ease-in-out_infinite]' : 'text-white/15',
                    )}
                    style={{ animationDuration: `${beat}s` }}
                    aria-hidden="true"
                >
                    ♥
                </span>
                <div>
                    <div className="font-mono text-[34px] font-bold leading-none tabular-nums text-(--deck-fg)">{bpm ?? '—'}</div>
                    <div className="mt-1 font-mono text-[10.5px] tracking-[0.12em] text-(--deck-fg-4)">BPM</div>
                </div>
            </div>
        </Tile>
    );
};

const ClockTile = ({ live, now, weatherOn }: { live: LiveState; now: Date; weatherOn: boolean }) => {
    const weather = live.weather;
    return (
        <Tile icon="clock" title={live.afk ? `AFK · ${formatDuration(live.afkSeconds)}` : 'Clock & weather'}>
            <div className="flex items-end justify-between gap-3">
                <div>
                    <div className="font-mono text-[34px] font-bold leading-none tabular-nums text-(--deck-fg)">
                        {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        <span className="text-[18px] text-(--deck-fg-4)">:{String(now.getSeconds()).padStart(2, '0')}</span>
                    </div>
                    <div className="mt-1.5 text-[12px] text-(--deck-fg-3)">
                        {now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </div>
                </div>
                {weather ? (
                    <div className="text-right">
                        <div className="text-[26px] leading-none">{weather.icon}</div>
                        <div className="mt-1 font-mono text-[15px] font-bold text-(--deck-fg)">
                            {Math.round(weather.temperature)}°{weather.unit.toUpperCase()}
                        </div>
                        <div className="max-w-32 truncate text-[11px] text-(--deck-fg-3)">{weather.place}</div>
                    </div>
                ) : (
                    <div className="text-right text-[11.5px] text-(--deck-fg-4)">{weatherOn ? 'Loading weather…' : 'Weather off'}</div>
                )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
                {live.muted ? <Chip>🔇 Muted</Chip> : null}
                {live.afk ? <Chip>💤 AFK</Chip> : null}
                {typeof live.params.VelocityMagnitude === 'number' ? (
                    <Chip>{(live.params.VelocityMagnitude as number).toFixed(1)} m/s</Chip>
                ) : null}
                <Chip>{Object.keys(live.params).length} avatar params</Chip>
            </div>
        </Tile>
    );
};

const Chip = ({ children }: { children: React.ReactNode }) => (
    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 font-mono text-[10.5px] text-(--deck-fg-2)">
        {children}
    </span>
);
