import { cn } from '@/shared/lib/ui';
import { Icon } from '@/shared/ui/Icon';
import { GhostButton, Group, RangeField, SettingRow } from '@/shared/ui/Panel';
import { Segmented } from '@/shared/ui/Segmented';
import { Switch } from '@/shared/ui/Switch';
import type { BotConfig } from '../../../shared/config';
import { ACCENTS, DEFAULT_PREFERENCES, EDensity, ELayout, ETheme, type Preferences, UI_SCALES } from '../../app/preferences';
import type { SectionProps } from '../../app/section-props';

// Inline backgrounds: gradients with commas do not survive Tailwind's arbitrary-value parsing reliably.
const THEMES: { value: ETheme; label: string; preview: string }[] = [
    { value: ETheme.Midnight, label: 'Midnight', preview: 'linear-gradient(160deg,#141821,#07080b)' },
    { value: ETheme.Oled, label: 'OLED', preview: '#000' },
    {
        value: ETheme.Nebula,
        label: 'Nebula',
        preview:
            'radial-gradient(circle at 80% 10%,rgba(236,72,153,.55),transparent 55%),radial-gradient(circle at 10% 90%,rgba(99,102,241,.6),transparent 60%),#0b0817',
    },
    { value: ETheme.Slate, label: 'Slate', preview: 'linear-gradient(160deg,#2c3a4f,#121822)' },
    {
        value: ETheme.Sakura,
        label: 'Sakura',
        preview: 'radial-gradient(circle at 85% 10%,rgba(244,114,182,.6),transparent 55%),#160b16',
    },
];

type SettingsProps = SectionProps & {
    prefs: Preferences;
    onPrefs: (prefs: Preferences) => void;
};

export const SettingsSection = ({ config, host, update, prefs, onPrefs }: SettingsProps) => {
    const change = (patch: Partial<Preferences>) => onPrefs({ ...prefs, ...patch });
    const setApp = (patch: Partial<BotConfig['app']>) => update((current) => ({ ...current, app: { ...current.app, ...patch } }), true);
    const electron = host.kind === 'electron';

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
                <div>
                    <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-(--deck-fg-4)">Theme</div>
                    <div className="grid grid-cols-5 gap-1.5">
                        {THEMES.map((theme) => (
                            <button
                                key={theme.value}
                                type="button"
                                aria-pressed={prefs.theme === theme.value}
                                className={cn(
                                    'flex flex-col gap-1.5 rounded-[11px] border p-1.5 text-[11px] font-semibold transition-all',
                                    prefs.theme === theme.value
                                        ? 'border-(--deck-accent) text-(--deck-fg) shadow-[0_0_18px_-8px_var(--deck-accent)]'
                                        : 'border-white/10 text-(--deck-fg-3) hover:border-white/20',
                                )}
                                onClick={() => change({ theme: theme.value })}
                            >
                                <span
                                    className="relative block h-11 w-full overflow-hidden rounded-[7px] border border-white/10"
                                    style={{ background: theme.preview }}
                                >
                                    <span className="absolute left-1.5 right-4 top-1.5 h-1 rounded-full bg-white/25" />
                                    <span className="absolute left-1.5 right-6 top-3.5 h-1 rounded-full bg-white/12" />
                                    <span className="absolute bottom-1.5 right-1.5 h-2.5 w-4.5 rounded-full bg-(--deck-accent)" />
                                </span>
                                {theme.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-(--deck-fg-4)">Accent</div>
                    <div className="flex flex-wrap items-center gap-2">
                        {ACCENTS.map((accent) => (
                            <button
                                key={accent}
                                type="button"
                                aria-label={`Accent ${accent}`}
                                aria-pressed={prefs.accent === accent}
                                className={cn(
                                    'size-8 rounded-full border-2 transition-transform hover:scale-110',
                                    prefs.accent === accent ? 'border-white shadow-[0_0_14px_-2px_currentColor]' : 'border-transparent',
                                )}
                                style={{ background: accent, color: accent }}
                                onClick={() => change({ accent })}
                            />
                        ))}
                        <label className="flex h-8 items-center gap-2 rounded-full border border-white/10 bg-white/5 pl-3 pr-1">
                            <span className="font-mono text-[11px] text-(--deck-fg-3)">{prefs.accent}</span>
                            <input
                                type="color"
                                value={prefs.accent}
                                aria-label="Custom accent"
                                className="size-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                                onChange={(event) => change({ accent: event.currentTarget.value })}
                            />
                        </label>
                    </div>
                </div>
                <Group>
                    <div className="space-y-2 py-3">
                        <div className="text-[13px] font-medium text-(--deck-fg)">Layout</div>
                        <Segmented
                            label="Layout"
                            value={prefs.layout}
                            options={[
                                { value: ELayout.Tabs, label: 'Pages', icon: 'list' },
                                { value: ELayout.Board, label: 'Board', icon: 'grid' },
                            ]}
                            onChange={(layout) => change({ layout })}
                        />
                        <p className="text-[11.5px] text-(--deck-fg-3)">
                            Pages shows one section at a time. Board puts every section on one screen as cards you can reorder, collapse and
                            hide.
                        </p>
                        <div className="pt-1 text-[13px] font-medium text-(--deck-fg)">Density</div>
                        <Segmented
                            label="Density"
                            value={prefs.density}
                            options={[
                                { value: EDensity.Compact, label: 'Compact' },
                                { value: EDensity.Cozy, label: 'Cozy' },
                                { value: EDensity.Roomy, label: 'Roomy' },
                            ]}
                            onChange={(density) => change({ density })}
                        />
                        <div className="pt-1 text-[13px] font-medium text-(--deck-fg)">UI size</div>
                        <Segmented
                            label="UI size"
                            value={String(prefs.scale)}
                            options={UI_SCALES.map((scale) => ({ value: String(scale), label: `${Math.round(scale * 100)}%` }))}
                            onChange={(scale) => change({ scale: Number(scale) })}
                        />
                    </div>
                    <div className="border-t border-white/6">
                        <RangeField
                            label="Ambient glow"
                            value={Math.round(prefs.glow * 100)}
                            min={0}
                            max={100}
                            format={(value) => `${value}%`}
                            onChange={(value) => change({ glow: value / 100 })}
                        />
                    </div>
                    <div className="border-t border-white/6">
                        <SettingRow title="Reduce motion" description="Skip ripples, pulses and slides.">
                            <Switch
                                checked={prefs.reduceMotion}
                                label="Reduce motion"
                                onChange={(reduceMotion) => change({ reduceMotion })}
                            />
                        </SettingRow>
                    </div>
                </Group>
                {JSON.stringify(prefs) !== JSON.stringify(DEFAULT_PREFERENCES) ? (
                    <GhostButton icon="refresh" onClick={() => onPrefs(DEFAULT_PREFERENCES)}>
                        Reset look & layout
                    </GhostButton>
                ) : null}
            </div>

            <div className="space-y-4">
                <Group title="App">
                    <SettingRow
                        title="Start with Windows"
                        description={electron ? 'Starts quietly in the tray when you log in.' : 'Desktop app only.'}
                    >
                        <Switch
                            checked={config.app.startWithWindows}
                            disabled={!electron}
                            label="Start with Windows"
                            onChange={(startWithWindows) => setApp({ startWithWindows })}
                        />
                    </SettingRow>
                    <SettingRow title="Start minimized" description="Open to the tray instead of a window.">
                        <Switch
                            checked={config.app.startMinimized}
                            disabled={!electron}
                            label="Start minimized"
                            onChange={(startMinimized) => setApp({ startMinimized })}
                        />
                    </SettingRow>
                    <SettingRow title="Close to tray" description="Closing the window keeps the bot running. Quit from the tray icon.">
                        <Switch
                            checked={config.app.minimizeToTray}
                            disabled={!electron}
                            label="Close to tray"
                            onChange={(minimizeToTray) => setApp({ minimizeToTray })}
                        />
                    </SettingRow>
                </Group>
                <Group title="About">
                    <div className="space-y-1.5 py-3 text-[12.5px] text-(--deck-fg-2)">
                        <div className="flex items-center gap-2">
                            <Icon className="size-4 text-(--deck-accent)" name="broadcast" />
                            <span className="font-semibold text-(--deck-fg)">OSC Bot</span>
                            <span className="font-mono text-[11px] text-(--deck-fg-4)">
                                {/^\d/.test(host.version) ? `v${host.version}` : host.version} · {host.kind} · {host.platform}
                            </span>
                        </div>
                        <p className="text-[12px] leading-relaxed text-(--deck-fg-3)">
                            In VRChat, turn on OSC from the Action Menu → Options → OSC → Enabled. The bot listens on 9001 and talks to
                            VRChat on 9000. Your profile is saved automatically.
                        </p>
                    </div>
                </Group>
            </div>
        </div>
    );
};
