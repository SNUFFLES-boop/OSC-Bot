import { type FormEvent, useMemo, useState } from 'react';

import { formatOscArg, parseOscArgs } from '@/shared/lib/osc-args';
import { cn } from '@/shared/lib/ui';
import { isVrchatNoise } from '@/shared/lib/vrchat-noise';
import { INPUT_CLASS } from '@/shared/ui/CommitInput';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { Segmented } from '@/shared/ui/Segmented';
import { createBinding, isValidAddress, LIMITS } from '../../../shared/config';
import { type ActivityEntry, type ArgPreview, EDirection } from '../../../shared/protocol';
import type { SectionProps } from '../../app/section-props';

enum EFilter {
    All = 'all',
    In = 'in',
    Out = 'out',
    Issues = 'issues',
}

const VISIBLE_ROWS = 200;

export const MonitorSection = ({ activity, update, command, notify }: SectionProps) => {
    const [filter, setFilter] = useState(EFilter.All);
    const [hideNoise, setHideNoise] = useState(true);
    const [search, setSearch] = useState('');
    const [pausedAt, setPausedAt] = useState<number | null>(null);
    const [clearedBefore, setClearedBefore] = useState(0);
    const latestId = activity[activity.length - 1]?.id ?? 0;

    const rows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return activity
            .filter((entry) => {
                if (entry.id <= clearedBefore) return false;
                if (pausedAt !== null && entry.id > pausedAt) return false;
                if (hideNoise && isVrchatNoise(entry.address)) return false;
                if (needle && !entry.address.toLowerCase().includes(needle) && !(entry.note ?? '').toLowerCase().includes(needle))
                    return false;
                if (filter === EFilter.In) return entry.direction === EDirection.In;
                if (filter === EFilter.Out) return entry.direction === EDirection.Out;
                if (filter === EFilter.Issues) return entry.direction === EDirection.Error || entry.failed;
                return true;
            })
            .slice(-VISIBLE_ROWS)
            .reverse();
    }, [activity, clearedBefore, filter, hideNoise, pausedAt, search]);

    const bind = (entry: ActivityEntry) => {
        update(
            (current) => ({
                ...current,
                bindings: [...current.bindings, createBinding({ address: entry.address })].slice(0, LIMITS.maxBindings),
            }),
            true,
        );
        notify(true, `Binding added for ${entry.address} (see Bindings)`);
    };

    return (
        <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Segmented
                    size="sm"
                    label="Filter traffic"
                    value={filter}
                    options={[
                        { value: EFilter.All, label: 'All' },
                        { value: EFilter.In, label: 'In', icon: 'arrow-down' },
                        { value: EFilter.Out, label: 'Out', icon: 'arrow-up' },
                        { value: EFilter.Issues, label: 'Issues', icon: 'alert' },
                    ]}
                    onChange={setFilter}
                />
                <input
                    value={search}
                    placeholder="Filter by address…"
                    aria-label="Filter by address"
                    className={cn(INPUT_CLASS, 'h-8 font-mono text-[12px]')}
                    onInput={(event) => setSearch(event.currentTarget.value)}
                />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <Chip active={hideNoise} icon="eye-off" label="Hide VRChat built-ins" onClick={() => setHideNoise((value) => !value)} />
                <Chip
                    active={pausedAt !== null}
                    icon={pausedAt !== null ? 'play' : 'pause'}
                    label={pausedAt !== null ? `Resume (${activity.filter((entry) => entry.id > pausedAt).length} new)` : 'Pause'}
                    onClick={() => setPausedAt((value) => (value === null ? latestId : null))}
                />
                <Chip active={false} icon="trash" label="Clear" onClick={() => setClearedBefore(latestId)} />
            </div>

            <div className="max-h-[28rem] overflow-y-auto overscroll-contain rounded-[13px] border border-white/8 bg-black/30 [scrollbar-width:thin]">
                {rows.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                        <Icon className="mx-auto size-6 text-(--deck-fg-4)" name="activity" />
                        <p className="mt-2 text-[12px] text-(--deck-fg-3)">
                            Waiting for OSC traffic… Is VRChat's OSC enabled (Action Menu → Options → OSC)?
                        </p>
                    </div>
                ) : (
                    <ul className="divide-y divide-white/5">
                        {rows.map((entry) => (
                            <Row key={entry.id} entry={entry} onBind={bind} />
                        ))}
                    </ul>
                )}
            </div>

            <Composer command={command} />
        </div>
    );
};

const DIRECTION: Record<EDirection, { icon: IconName; className: string }> = {
    [EDirection.In]: { icon: 'arrow-down', className: 'bg-[color-mix(in_oklab,var(--deck-accent)_16%,transparent)] text-(--deck-accent)' },
    [EDirection.Out]: { icon: 'arrow-up', className: 'bg-violet-400/15 text-violet-300' },
    [EDirection.Error]: { icon: 'alert', className: 'bg-red-500/15 text-red-300' },
};

const TONES: Record<string, string> = {
    i: 'text-sky-300',
    f: 'text-emerald-300',
    d: 'text-emerald-300',
    s: 'text-amber-200',
    T: 'text-(--deck-accent)',
    F: 'text-red-300',
};

const Row = ({ entry, onBind }: { entry: ActivityEntry; onBind: (entry: ActivityEntry) => void }) => {
    const style = DIRECTION[entry.direction] ?? DIRECTION[EDirection.Error];
    return (
        <li className="group flex items-start gap-2 px-2.5 py-2 motion-safe:animate-[osc-rise_200ms_ease-out]">
            <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px]', style.className)}>
                <Icon className="size-3" name={style.icon} stroke={2.2} />
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate font-mono text-[11.5px] text-(--deck-fg)">{entry.address || entry.note}</span>
                    {entry.count > 1 ? (
                        <span
                            key={entry.count}
                            className="shrink-0 rounded-full bg-white/8 px-1.5 font-mono text-[9.5px] font-bold tabular-nums text-(--deck-fg-2)"
                        >
                            ×{entry.count}
                        </span>
                    ) : null}
                </div>
                {entry.args.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                        {entry.args.map((arg: ArgPreview, index) => (
                            <span
                                key={index}
                                className="inline-flex max-w-full items-center gap-1 rounded-[5px] bg-white/5 px-1.5 py-0.5 font-mono text-[10.5px]"
                            >
                                <span className="text-(--deck-fg-4)">{arg.type}</span>
                                <span className={cn('truncate', TONES[arg.type] ?? 'text-(--deck-fg-2)')}>{formatOscArg(arg)}</span>
                            </span>
                        ))}
                    </div>
                ) : null}
                {entry.address && entry.note ? (
                    <div className={cn('mt-1 text-[11px]', entry.failed ? 'text-amber-300' : 'text-(--deck-fg-3)')}>{entry.note}</div>
                ) : null}
                <div className="mt-0.5 font-mono text-[9.5px] text-(--deck-fg-4)">
                    {new Date(entry.at).toLocaleTimeString([], { hour12: false })}
                    {entry.peer ? ` · ${entry.peer}` : ''}
                </div>
            </div>
            {entry.direction === EDirection.In && entry.address ? (
                <button
                    type="button"
                    className="shrink-0 rounded-[7px] border border-white/10 px-2 py-1 text-[10.5px] font-semibold text-(--deck-fg-3) opacity-80 hover:text-(--deck-accent) group-hover:opacity-100"
                    onClick={() => onBind(entry)}
                >
                    Bind
                </button>
            ) : null}
        </li>
    );
};

const Chip = ({ active, icon, label, onClick }: { active: boolean; icon: IconName; label: string; onClick: () => void }) => (
    <button
        type="button"
        aria-pressed={active}
        className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
            active
                ? 'border-[color-mix(in_oklab,var(--deck-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--deck-accent)_12%,transparent)] text-(--deck-accent)'
                : 'border-white/10 bg-white/4 text-(--deck-fg-3)',
        )}
        onClick={onClick}
    >
        <Icon className="size-3" name={icon} stroke={2} />
        {label}
    </button>
);

const Composer = ({ command }: { command: SectionProps['command'] }) => {
    const [address, setAddress] = useState('/avatar/parameters/');
    const [args, setArgs] = useState('1');
    const [target, setTarget] = useState('');
    const valid = isValidAddress(address.trim());

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!valid) return;
        const [host, port] = target.trim().split(':');
        command({
            action: 'send_osc',
            address: address.trim(),
            args: parseOscArgs(args),
            ...(target.trim() ? { host, port: Number(port) } : {}),
        });
    };

    return (
        <form className="rounded-[13px] border border-white/8 bg-black/15 p-2.5" onSubmit={submit}>
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-(--deck-fg-4)">
                <Icon className="size-3" name="send" />
                Send a test message
            </div>
            <div className="grid gap-1.5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <input
                    value={address}
                    spellCheck={false}
                    aria-label="Address"
                    aria-invalid={!valid || undefined}
                    className={cn(INPUT_CLASS, 'font-mono text-[12px]', !valid && 'border-red-400/50')}
                    onInput={(event) => setAddress(event.currentTarget.value)}
                />
                <input
                    value={args}
                    spellCheck={false}
                    placeholder='1 0.5 true "text"'
                    aria-label="Arguments"
                    className={cn(INPUT_CLASS, 'font-mono text-[12px]')}
                    onInput={(event) => setArgs(event.currentTarget.value)}
                />
                <input
                    value={target}
                    spellCheck={false}
                    placeholder="VRChat (or host:port)"
                    aria-label="Target"
                    className={cn(INPUT_CLASS, 'font-mono text-[12px]')}
                    onInput={(event) => setTarget(event.currentTarget.value)}
                />
                <button
                    type="submit"
                    disabled={!valid}
                    className="flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-(--deck-accent) px-4 text-[12px] font-bold text-black disabled:opacity-35"
                >
                    <Icon className="size-3.5" name="send" stroke={2.2} />
                    Send
                </button>
            </div>
        </form>
    );
};
