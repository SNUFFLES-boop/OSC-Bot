import type { ReactNode } from 'react';

import { CommitInput } from '@/shared/ui/CommitInput';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { IconButton } from '@/shared/ui/IconButton';
import { RangeField, SettingRow, StatusDot } from '@/shared/ui/Panel';
import { Segmented } from '@/shared/ui/Segmented';
import { Switch } from '@/shared/ui/Switch';
import { type BotConfig, EHeartRateSource, ETemperatureUnit, isValidAddress } from '../../../shared/config';
import { EProviderState, type ProviderStatus } from '../../../shared/protocol';
import type { SectionProps } from '../../app/section-props';

export const SourcesSection = ({ config, live, host, update, command }: SectionProps) => {
    const set = <K extends keyof BotConfig>(key: K, change: Partial<BotConfig[K]>, immediate = true) =>
        update((current) => ({ ...current, [key]: { ...(current[key] as object), ...change } }), immediate);

    return (
        <div className="grid gap-3 lg:grid-cols-2">
            <SourceCard
                icon="music"
                title="Now playing"
                description="Spotify, YouTube in your browser, Apple Music, VLC… anything in Windows' media controls."
                enabled={config.media.enabled}
                status={live.providers.media}
                onToggle={(enabled) => set('media', { enabled })}
            >
                <div className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate text-[12.5px] text-(--deck-fg-2)">
                        {live.music ? `${live.music.playing ? '▶' : '⏸'} ${live.music.title} — ${live.music.artist}` : 'Nothing playing'}
                    </span>
                    <span className="flex shrink-0 gap-1">
                        <IconButton
                            size="sm"
                            icon="skip-prev"
                            label="Previous"
                            onClick={() => command({ action: 'media', op: 'previous' })}
                        />
                        <IconButton
                            size="sm"
                            icon="play"
                            label="Play or pause"
                            onClick={() => command({ action: 'media', op: 'play_pause' })}
                        />
                        <IconButton size="sm" icon="skip-next" label="Next" onClick={() => command({ action: 'media', op: 'next' })} />
                    </span>
                </div>
            </SourceCard>

            <SourceCard
                icon="cpu"
                title="PC stats"
                description="CPU, RAM and GPU load. GPU uses nvidia-smi, or Windows counters for AMD and Intel."
                enabled={config.system.enabled}
                status={live.providers.system}
                onToggle={(enabled) => set('system', { enabled })}
            >
                <SettingRow title="Read the GPU" description={live.system?.gpuName ?? 'Detected automatically'}>
                    <Switch checked={config.system.gpu} label="Read the GPU" onChange={(gpu) => set('system', { gpu })} />
                </SettingRow>
            </SourceCard>

            <SourceCard
                icon="heart"
                title="Heart rate"
                description="From a Pulsoid token, or any app that sends your heart rate over OSC."
                enabled={config.heartRate.enabled}
                status={live.providers.heartRate}
                onToggle={(enabled) => set('heartRate', { enabled })}
            >
                <div className="space-y-2.5 py-2">
                    <Segmented
                        label="Heart rate source"
                        value={config.heartRate.source}
                        options={[
                            { value: EHeartRateSource.Pulsoid, label: 'Pulsoid' },
                            { value: EHeartRateSource.Osc, label: 'OSC input' },
                        ]}
                        onChange={(source) => set('heartRate', { source })}
                    />
                    {config.heartRate.source === EHeartRateSource.Pulsoid ? (
                        <div>
                            <CommitInput
                                mono
                                value={config.heartRate.pulsoidToken}
                                label="Pulsoid access token"
                                type="password"
                                placeholder="Pulsoid access token"
                                onCommit={(token) => {
                                    set('heartRate', { pulsoidToken: token.trim() });
                                    return true;
                                }}
                            />
                            <a
                                href="https://pulsoid.net/ui/keys"
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-(--deck-accent) hover:underline"
                            >
                                Get a token from pulsoid.net
                                <Icon className="size-3" name="arrow-right" />
                            </a>
                        </div>
                    ) : (
                        <CommitInput
                            mono
                            value={config.heartRate.oscAddress}
                            label="Heart rate OSC address"
                            placeholder="/avatar/parameters/HR"
                            onCommit={(address) => {
                                if (!isValidAddress(address.trim())) return false;
                                set('heartRate', { oscAddress: address.trim() });
                                return true;
                            }}
                        />
                    )}
                    <RangeField
                        label="Max heart rate (for 0–1 parameters)"
                        value={config.heartRate.maxBpm}
                        min={100}
                        max={250}
                        step={5}
                        format={(value) => `${value} bpm`}
                        onChange={(maxBpm) => set('heartRate', { maxBpm }, false)}
                    />
                </div>
            </SourceCard>

            <SourceCard
                icon="cloud"
                title="Weather"
                description="Current weather from Open-Meteo. Free, no account, refreshed every 15 minutes."
                enabled={config.weather.enabled}
                status={live.providers.weather}
                onToggle={(enabled) => set('weather', { enabled })}
                extra={
                    <IconButton size="sm" icon="refresh" label="Refresh weather" onClick={() => command({ action: 'weather_refresh' })} />
                }
            >
                <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2 py-2">
                    <CommitInput
                        value={config.weather.city}
                        label="City"
                        placeholder="City, e.g. Tokyo"
                        onCommit={(city) => {
                            set('weather', { city: city.trim() });
                            return true;
                        }}
                    />
                    <Segmented
                        label="Temperature unit"
                        value={config.weather.unit}
                        options={[
                            { value: ETemperatureUnit.Celsius, label: '°C' },
                            { value: ETemperatureUnit.Fahrenheit, label: '°F' },
                        ]}
                        onChange={(unit) => set('weather', { unit })}
                    />
                </div>
                {live.weather ? (
                    <div className="pb-2 text-[12.5px] text-(--deck-fg-2)">
                        {live.weather.icon} {live.weather.label} · {Math.round(live.weather.temperature)}°{live.weather.unit.toUpperCase()}{' '}
                        in {live.weather.place}
                    </div>
                ) : null}
            </SourceCard>

            <section className="rounded-[15px] border border-white/8 bg-black/15 px-3.5 py-3 lg:col-span-2">
                <div className="mb-1 flex items-center gap-2">
                    <Icon className="size-4 text-(--deck-accent)" name="moon" />
                    <span className="text-[14px] font-semibold text-(--deck-fg)">AFK detection</span>
                    <span className="ml-auto font-mono text-[11px] text-(--deck-fg-3)">{live.afk ? '💤 AFK now' : 'Active'}</span>
                </div>
                <div className="grid gap-x-6 md:grid-cols-2">
                    <SettingRow title="Use VRChat's AFK" description="VRChat marks you AFK when you take the headset off or open the menu.">
                        <Switch checked={config.afk.useVrchat} label="Use VRChat AFK" onChange={(useVrchat) => set('afk', { useVrchat })} />
                    </SettingRow>
                    <SettingRow
                        title="Use keyboard & mouse idle"
                        description={host.kind === 'electron' ? 'For desktop mode.' : 'Only available in the desktop app.'}
                    >
                        <Switch
                            checked={config.afk.useSystemIdle}
                            label="Use system idle"
                            onChange={(useSystemIdle) => set('afk', { useSystemIdle })}
                        />
                    </SettingRow>
                </div>
                <RangeField
                    label="Idle before AFK"
                    value={config.afk.idleMinutes}
                    min={1}
                    max={30}
                    format={(value) => `${value} min`}
                    onChange={(idleMinutes) => set('afk', { idleMinutes }, false)}
                />
            </section>
        </div>
    );
};

const SourceCard = ({
    icon,
    title,
    description,
    enabled,
    status,
    extra,
    onToggle,
    children,
}: {
    icon: IconName;
    title: string;
    description: string;
    enabled: boolean;
    status: ProviderStatus;
    extra?: ReactNode;
    onToggle: (enabled: boolean) => void;
    children: ReactNode;
}) => {
    const tone =
        !enabled || status.state === EProviderState.Off
            ? 'off'
            : status.state === EProviderState.Ok
              ? 'ok'
              : status.state === EProviderState.Starting
                ? 'warn'
                : 'error';
    return (
        <section className="rounded-[15px] border border-white/8 bg-black/15 px-3.5 py-3">
            <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[color-mix(in_oklab,var(--deck-accent)_12%,transparent)] text-(--deck-accent)">
                    <Icon className="size-4.5" name={icon} />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-(--deck-fg)">{title}</span>
                        <StatusDot tone={tone} />
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-(--deck-fg-3)">{description}</p>
                    {enabled && status.detail ? (
                        <p className={`mt-1 text-[11.5px] ${tone === 'error' ? 'text-amber-300' : 'text-(--deck-fg-4)'}`}>
                            {status.detail}
                        </p>
                    ) : null}
                </div>
                {extra}
                <Switch checked={enabled} label={`Enable ${title}`} onChange={onToggle} />
            </div>
            {enabled ? <div className="mt-1.5 border-t border-white/6">{children}</div> : null}
        </section>
    );
};
