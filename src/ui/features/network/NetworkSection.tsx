import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';

import { copyText } from '@/shared/lib/clipboard';
import { cn } from '@/shared/lib/ui';
import { CommitInput, INPUT_CLASS } from '@/shared/ui/CommitInput';
import { Icon } from '@/shared/ui/Icon';
import { IconButton } from '@/shared/ui/IconButton';
import { Eyebrow, GhostButton, Group, SettingRow } from '@/shared/ui/Panel';
import { Switch } from '@/shared/ui/Switch';
import {
    type BotConfig,
    createRelay,
    createToken,
    isValidAddress,
    isValidHost,
    isValidPort,
    LIMITS,
    normalizeConfig,
    type Relay,
} from '../../../shared/config';
import type { SectionProps } from '../../app/section-props';

export const NetworkSection = ({ config, host, update, notify }: SectionProps) => {
    const set = <K extends keyof BotConfig>(key: K, change: Partial<BotConfig[K]>) =>
        update((current) => ({ ...current, [key]: { ...(current[key] as object), ...change } }), true);
    const commitPort = (apply: (port: number) => void) => (raw: string) => {
        if (!isValidPort(raw.trim())) return false;
        apply(Number(raw.trim()));
        return true;
    };

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
                <Group title="OSC">
                    <SettingRow title="Listen port" description="VRChat sends avatar parameters to 9001.">
                        <div className="w-24">
                            <CommitInput
                                mono
                                inputMode="numeric"
                                value={String(config.osc.listenPort)}
                                label="Listen port"
                                className="h-9 text-center"
                                onCommit={commitPort((listenPort) => set('osc', { listenPort }))}
                            />
                        </div>
                    </SettingRow>
                    <SettingRow title="Accept OSC from other devices" description="TouchOSC on a phone, a Quest… OSC has no password.">
                        <Switch
                            checked={config.osc.listenLan}
                            label="Accept OSC from the network"
                            onChange={(listenLan) => set('osc', { listenLan })}
                        />
                    </SettingRow>
                    <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 border-t border-white/6 py-3">
                        <div>
                            <Eyebrow>VRChat host</Eyebrow>
                            <CommitInput
                                mono
                                value={config.osc.vrchatHost}
                                label="VRChat host"
                                className="h-9"
                                onCommit={(raw) => {
                                    if (!isValidHost(raw.trim())) return false;
                                    set('osc', { vrchatHost: raw.trim() });
                                    return true;
                                }}
                            />
                        </div>
                        <div>
                            <Eyebrow>Port</Eyebrow>
                            <CommitInput
                                mono
                                inputMode="numeric"
                                value={String(config.osc.vrchatPort)}
                                label="VRChat port"
                                className="h-9 text-center"
                                onCommit={commitPort((vrchatPort) => set('osc', { vrchatPort }))}
                            />
                        </div>
                    </div>
                    <p className="pb-3 text-[11.5px] leading-snug text-(--deck-fg-3)">
                        Playing on a standalone Quest? Put the headset's IP as the VRChat host and turn on "Accept OSC from other devices".
                    </p>
                </Group>

                <Relays relays={config.relays} update={update} />
            </div>

            <div className="space-y-4">
                <PhoneRemote config={config} remoteUrls={host.remoteUrls} set={set} notify={notify} />
                <Backup config={config} update={update} notify={notify} />
            </div>
        </div>
    );
};

const Relays = ({ relays, update }: { relays: Relay[]; update: SectionProps['update'] }) => {
    const setRelays = (next: Relay[]) => update((current) => ({ ...current, relays: next.slice(0, LIMITS.maxRelays) }), true);
    const patch = (id: string, change: Partial<Relay>) =>
        setRelays(relays.map((relay) => (relay.id === id ? { ...relay, ...change } : relay)));
    return (
        <div>
            <Eyebrow>Relays · share VRChat with other OSC apps</Eyebrow>
            <p className="mb-2 text-[11.5px] leading-snug text-(--deck-fg-3)">
                Only one app can listen on 9001. Relays forward everything VRChat sends to other apps on their own ports, so
                VRCFaceTracking, a heart-rate app and this bot can all run together.
            </p>
            <div className="space-y-2">
                {relays.map((relay) => (
                    <div
                        key={relay.id}
                        className={cn(
                            'rounded-[13px] border bg-black/15 p-2.5',
                            relay.enabled ? 'border-white/8' : 'border-white/5 opacity-60',
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <CommitInput
                                value={relay.name}
                                label="Relay name"
                                className="h-9 flex-1 font-semibold"
                                onCommit={(name) => {
                                    if (!name.trim()) return false;
                                    patch(relay.id, { name: name.trim().slice(0, 32) });
                                    return true;
                                }}
                            />
                            <Switch
                                size="sm"
                                checked={relay.enabled}
                                label={`Enable ${relay.name}`}
                                onChange={(enabled) => patch(relay.id, { enabled })}
                            />
                            <IconButton
                                size="sm"
                                icon="trash"
                                label={`Remove ${relay.name}`}
                                onClick={() => setRelays(relays.filter((entry) => entry.id !== relay.id))}
                            />
                        </div>
                        <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_84px] gap-1.5">
                            <CommitInput
                                mono
                                value={relay.host}
                                label="Relay host"
                                className="h-9"
                                onCommit={(raw) => {
                                    if (!isValidHost(raw.trim())) return false;
                                    patch(relay.id, { host: raw.trim() });
                                    return true;
                                }}
                            />
                            <CommitInput
                                mono
                                inputMode="numeric"
                                value={String(relay.port)}
                                label="Relay port"
                                className="h-9 text-center"
                                onCommit={(raw) => {
                                    if (!isValidPort(raw.trim())) return false;
                                    patch(relay.id, { port: Number(raw.trim()) });
                                    return true;
                                }}
                            />
                        </div>
                        <CommitInput
                            mono
                            value={relay.pattern}
                            label="Only forward matching addresses"
                            placeholder="Forward everything (or e.g. /avatar/parameters/*)"
                            className="mt-1.5 h-9"
                            onCommit={(raw) => {
                                if (raw.trim() && !isValidAddress(raw.trim())) return false;
                                patch(relay.id, { pattern: raw.trim() });
                                return true;
                            }}
                        />
                    </div>
                ))}
                {relays.length < LIMITS.maxRelays ? (
                    <GhostButton icon="plus" onClick={() => setRelays([...relays, createRelay({ port: 9002 + relays.length })])}>
                        Add relay
                    </GhostButton>
                ) : null}
            </div>
        </div>
    );
};

const PhoneRemote = ({
    config,
    remoteUrls,
    set,
    notify,
}: {
    config: BotConfig;
    remoteUrls: string[];
    set: <K extends keyof BotConfig>(key: K, change: Partial<BotConfig[K]>) => void;
    notify: SectionProps['notify'];
}) => {
    const url = remoteUrls[0] ?? null;
    return (
        <Group title="Phone remote">
            <SettingRow
                title="Control from your phone"
                description="Opens this panel on phones and tablets on the same Wi-Fi, protected by a secret link."
            >
                <Switch
                    checked={config.remote.allowLan}
                    label="Control from your phone"
                    onChange={(allowLan) => set('remote', { allowLan })}
                />
            </SettingRow>
            {config.remote.allowLan ? (
                <div className="border-t border-white/6 py-3">
                    {url ? (
                        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                            <QrCode value={url} />
                            <div className="min-w-0 flex-1 space-y-2">
                                <p className="text-[12px] leading-snug text-(--deck-fg-3)">
                                    Scan with your phone camera, or open one of these links:
                                </p>
                                {remoteUrls.map((link) => (
                                    <div key={link} className="flex items-center gap-1.5">
                                        <span className="min-w-0 flex-1 truncate rounded-[8px] bg-white/5 px-2 py-1.5 font-mono text-[10.5px] text-(--deck-fg-2)">
                                            {link}
                                        </span>
                                        <IconButton
                                            size="sm"
                                            icon="copy"
                                            label="Copy link"
                                            onClick={() =>
                                                void copyText(link).then((ok) => notify(ok, ok ? 'Link copied' : 'Could not copy'))
                                            }
                                        />
                                    </div>
                                ))}
                                <GhostButton icon="refresh" onClick={() => set('remote', { token: createToken() })}>
                                    New secret link
                                </GhostButton>
                            </div>
                        </div>
                    ) : (
                        <p className="text-[12px] text-(--deck-fg-3)">Starting… If no link appears, this PC has no network connection.</p>
                    )}
                </div>
            ) : null}
            <SettingRow title="Panel port" description="The window and phone use this local port.">
                <div className="w-24">
                    <CommitInput
                        mono
                        inputMode="numeric"
                        value={String(config.remote.port)}
                        label="Panel port"
                        className="h-9 text-center"
                        onCommit={(raw) => {
                            if (!isValidPort(raw.trim())) return false;
                            set('remote', { port: Number(raw.trim()) });
                            return true;
                        }}
                    />
                </div>
            </SettingRow>
        </Group>
    );
};

const QrCode = ({ value }: { value: string }) => {
    const modules = useMemo(() => {
        const qr = qrcode(0, 'M');
        qr.addData(value);
        qr.make();
        const count = qr.getModuleCount();
        const cells: string[] = [];
        for (let row = 0; row < count; row += 1) {
            for (let col = 0; col < count; col += 1) {
                if (qr.isDark(row, col)) cells.push(`M${col} ${row}h1v1h-1z`);
            }
        }
        return { count, path: cells.join('') };
    }, [value]);

    return (
        <div className="shrink-0 rounded-[14px] bg-white p-2.5 shadow-[0_0_30px_-8px_var(--deck-accent)]">
            <svg
                role="img"
                aria-label="QR code for the phone link"
                className="size-36"
                viewBox={`0 0 ${modules.count} ${modules.count}`}
                shapeRendering="crispEdges"
            >
                <path d={modules.path} fill="#07080b" />
            </svg>
        </div>
    );
};

const Backup = ({ config, update, notify }: { config: BotConfig; update: SectionProps['update']; notify: SectionProps['notify'] }) => {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    return (
        <Group title="Backup & restore">
            <SettingRow title="Profile as JSON" description="Copy everything (messages, bindings, sync…) or paste a profile in.">
                <GhostButton
                    icon={open ? 'x' : 'download'}
                    onClick={() => {
                        setText(JSON.stringify({ ...config, remote: { ...config.remote, token: undefined } }, null, 2));
                        setOpen(!open);
                    }}
                >
                    {open ? 'Close' : 'Open'}
                </GhostButton>
            </SettingRow>
            {open ? (
                <div className="space-y-2 pb-3">
                    <textarea
                        value={text}
                        spellCheck={false}
                        aria-label="Profile JSON"
                        className={cn(INPUT_CLASS, 'h-56 resize-y py-2 font-mono text-[11px] leading-relaxed')}
                        onInput={(event) => setText(event.currentTarget.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <GhostButton
                            icon="copy"
                            onClick={() => void copyText(text).then((ok) => notify(ok, ok ? 'Profile copied' : 'Could not copy'))}
                        >
                            Copy
                        </GhostButton>
                        <button
                            type="button"
                            className="flex h-9.5 items-center justify-center gap-1.5 rounded-[10px] bg-(--deck-accent) text-[12px] font-bold text-black"
                            onClick={() => {
                                try {
                                    const parsed = normalizeConfig(JSON.parse(text));
                                    // Importing never changes how this PC is reachable.
                                    update((current) => ({ ...parsed, remote: current.remote, osc: current.osc }), true);
                                    notify(true, 'Profile imported');
                                    setOpen(false);
                                } catch {
                                    notify(false, 'That is not valid JSON');
                                }
                            }}
                        >
                            <Icon className="size-3.5" name="upload" stroke={2.1} />
                            Import
                        </button>
                    </div>
                </div>
            ) : null}
        </Group>
    );
};
