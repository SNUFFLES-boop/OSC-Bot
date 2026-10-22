import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/shared/lib/ui';
import { isVrchatNoise } from '@/shared/lib/vrchat-noise';
import { CommitInput, INPUT_CLASS } from '@/shared/ui/CommitInput';
import { Icon } from '@/shared/ui/Icon';
import { IconButton } from '@/shared/ui/IconButton';
import { Eyebrow, PrimaryButton, SelectField } from '@/shared/ui/Panel';
import { Segmented } from '@/shared/ui/Segmented';
import { Switch } from '@/shared/ui/Switch';
import { type Binding, createBinding, EAction, EParamType, isValidAddress, LIMITS } from '../../../shared/config';
import { EDirection } from '../../../shared/protocol';
import type { SectionProps } from '../../app/section-props';

const ACTIONS: { value: EAction; label: string; hint: string }[] = [
    { value: EAction.ChatboxSend, label: 'Say in chatbox', hint: 'Sends your message (tokens work) and holds it for one interval.' },
    { value: EAction.ChatboxToggle, label: 'Pause / resume chatbox', hint: 'Flips the chatbox bot on and off.' },
    { value: EAction.ChatboxNext, label: 'Next chatbox message', hint: 'Skips to the next rotation message.' },
    { value: EAction.ChatboxClear, label: 'Clear chatbox', hint: 'Empties the chatbox for one interval.' },
    { value: EAction.MediaPlayPause, label: 'Music: play / pause', hint: 'Controls whatever is playing on Windows.' },
    { value: EAction.MediaNext, label: 'Music: next track', hint: 'Skips to the next track.' },
    { value: EAction.MediaPrevious, label: 'Music: previous track', hint: 'Goes back a track.' },
    { value: EAction.SendOsc, label: 'Set avatar parameter', hint: 'Sends a value to VRChat, e.g. to turn on a light.' },
    { value: EAction.AfkToggle, label: 'Toggle AFK', hint: 'Marks you AFK until triggered again.' },
];

const LEARN_TIMEOUT_MS = 20000;

export const BindingsSection = ({ config, activity, update }: SectionProps) => {
    const bindings = config.bindings;
    const [expanded, setExpanded] = useState<string | null>(null);
    const [learning, setLearning] = useState<{ id: string; since: number } | null>(null);
    const learnTimer = useRef<number | null>(null);
    const lastId = activity[activity.length - 1]?.id ?? 0;

    const setBindings = (next: Binding[]) => update((current) => ({ ...current, bindings: next.slice(0, LIMITS.maxBindings) }), true);
    const patch = (id: string, change: Partial<Binding>, immediate = true) =>
        update(
            (current) => ({
                ...current,
                bindings: current.bindings.map((binding) => (binding.id === id ? { ...binding, ...change } : binding)),
            }),
            immediate,
        );

    const stopLearning = () => {
        if (learnTimer.current !== null) window.clearTimeout(learnTimer.current);
        learnTimer.current = null;
        setLearning(null);
    };

    // Learn takes the first fresh input that is not VRChat's own background noise.
    useEffect(() => {
        if (!learning) return;
        const heard = activity.find(
            (entry) => entry.id > learning.since && entry.direction === EDirection.In && entry.address && !isVrchatNoise(entry.address),
        );
        if (heard) {
            patch(learning.id, { address: heard.address });
            stopLearning();
        }
    });

    useEffect(() => () => stopLearning(), []);

    const recent = useMemo(() => {
        const seen = new Map<string, number>();
        for (const entry of activity) {
            if (entry.direction === EDirection.In && entry.address && !isVrchatNoise(entry.address)) seen.set(entry.address, entry.at);
        }
        const bound = new Set(bindings.map((binding) => binding.address));
        return [...seen.entries()]
            .filter(([address]) => !bound.has(address))
            .sort((left, right) => right[1] - left[1])
            .slice(0, 8)
            .map(([address]) => address);
    }, [activity, bindings]);

    const lastHit = useMemo(() => {
        const hits = new Map<string, number>();
        for (const entry of activity) if (entry.bindingId) hits.set(entry.bindingId, entry.at);
        return hits;
    }, [activity]);

    const add = (address?: string) => {
        const binding = createBinding(address ? { address } : {});
        setBindings([...bindings, binding]);
        setExpanded(binding.id);
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <PrimaryButton icon="plus" disabled={bindings.length >= LIMITS.maxBindings} onClick={() => add()}>
                    New binding
                </PrimaryButton>
                <p className="min-w-0 flex-1 text-[12px] leading-snug text-(--deck-fg-3)">
                    Trigger actions from avatar buttons, contacts, TouchOSC or Stream Deck. A binding fires when its input turns on (1, true
                    or a press); releases are ignored.
                </p>
            </div>

            {learning ? (
                <div className="flex items-center gap-3 rounded-[13px] border border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--deck-accent)_10%,transparent)] px-3 py-2.5 motion-safe:animate-[osc-rise_220ms_ease-out]">
                    <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)]">
                        <span className="osc-radar-sweep absolute inset-0 rounded-full" />
                        <Icon className="relative size-4 text-(--deck-accent)" name="radar" />
                    </span>
                    <span className="min-w-0 flex-1 text-[12.5px] text-(--deck-fg-2)">
                        <b className="text-(--deck-fg)">Listening…</b> press an avatar button, flip a toggle or move a control.
                    </span>
                    <button
                        type="button"
                        className="rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold text-(--deck-fg-2) hover:bg-white/6"
                        onClick={stopLearning}
                    >
                        Cancel
                    </button>
                </div>
            ) : null}

            {recent.length ? (
                <div>
                    <Eyebrow>Recent inputs · tap to bind</Eyebrow>
                    <div className="flex flex-wrap gap-1.5">
                        {recent.map((address) => (
                            <button
                                key={address}
                                type="button"
                                className="max-w-full truncate rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-(--deck-fg-2) hover:border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)] hover:text-(--deck-accent)"
                                onClick={() => add(address)}
                            >
                                + {address}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {bindings.length === 0 ? (
                <div className="rounded-[13px] border border-dashed border-white/12 px-4 py-6 text-center text-[12.5px] text-(--deck-fg-3)">
                    <Icon className="mx-auto mb-2 size-6 text-(--deck-fg-4)" name="link" />
                    No bindings yet.
                </div>
            ) : (
                <ul className="overflow-hidden rounded-[13px] border border-white/8">
                    {bindings.map((binding, index) => {
                        const action = ACTIONS.find((entry) => entry.value === binding.action) ?? ACTIONS[0];
                        const open = expanded === binding.id;
                        const hit = lastHit.get(binding.id);
                        const recentHit = hit !== undefined && Date.now() - hit < 4000;
                        return (
                            <li key={binding.id} className={cn(index && 'border-t border-white/6', open && 'bg-white/2.5')}>
                                <div className="flex items-center gap-2.5 px-3 py-2.5">
                                    <span className="relative flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-white/10 bg-white/4">
                                        {recentHit ? (
                                            <span
                                                key={hit}
                                                className="absolute inset-0 rounded-[9px] motion-safe:animate-[osc-flash_900ms_ease-out]"
                                            />
                                        ) : null}
                                        <Icon
                                            className={cn('size-4', binding.enabled ? 'text-(--deck-accent)' : 'text-(--deck-fg-4)')}
                                            name="link"
                                        />
                                    </span>
                                    <button
                                        type="button"
                                        aria-expanded={open}
                                        className="min-w-0 flex-1 text-left"
                                        onClick={() => setExpanded(open ? null : binding.id)}
                                    >
                                        <span
                                            className={cn(
                                                'block truncate font-mono text-[12px]',
                                                binding.enabled ? 'text-(--deck-fg)' : 'text-(--deck-fg-4) line-through',
                                            )}
                                        >
                                            {binding.address}
                                        </span>
                                        <span className="block truncate text-[11.5px] text-(--deck-fg-3)">→ {action.label}</span>
                                    </button>
                                    <Switch
                                        size="sm"
                                        checked={binding.enabled}
                                        label={`Enable ${binding.address}`}
                                        onChange={(enabled) => patch(binding.id, { enabled })}
                                    />
                                    <Icon
                                        className={cn('size-4 shrink-0 text-(--deck-fg-4) transition-transform', open && 'rotate-180')}
                                        name="chevron-down"
                                    />
                                </div>
                                {open ? (
                                    <div className="space-y-3 border-t border-white/6 px-3 pb-3.5 pt-3 motion-safe:animate-[osc-rise_200ms_ease-out]">
                                        <div>
                                            <Eyebrow>Input address</Eyebrow>
                                            <div className="flex gap-1.5">
                                                <CommitInput
                                                    mono
                                                    value={binding.address}
                                                    label="Input address"
                                                    onCommit={(address) => {
                                                        if (!isValidAddress(address.trim())) return false;
                                                        patch(binding.id, { address: address.trim() });
                                                        return true;
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    aria-pressed={learning?.id === binding.id}
                                                    className={cn(
                                                        'flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[12px] font-semibold',
                                                        learning?.id === binding.id
                                                            ? 'border-(--deck-accent) bg-[color-mix(in_oklab,var(--deck-accent)_18%,transparent)] text-(--deck-accent)'
                                                            : 'border-white/10 bg-white/5 text-(--deck-fg-2)',
                                                    )}
                                                    onClick={() => {
                                                        if (learning?.id === binding.id) {
                                                            stopLearning();
                                                            return;
                                                        }
                                                        stopLearning();
                                                        setLearning({ id: binding.id, since: lastId });
                                                        learnTimer.current = window.setTimeout(stopLearning, LEARN_TIMEOUT_MS);
                                                    }}
                                                >
                                                    <Icon className="size-3.5" name="radar" />
                                                    Learn
                                                </button>
                                            </div>
                                            <p className="mt-1 text-[11px] text-(--deck-fg-4)">
                                                Wildcards work: * ? [1-4] and {'{'}a,b{'}'}.
                                            </p>
                                        </div>
                                        <div>
                                            <Eyebrow>Action</Eyebrow>
                                            <SelectField
                                                label="Action"
                                                value={binding.action}
                                                options={ACTIONS.map(({ value, label }) => ({ value, label }))}
                                                onChange={(next) => patch(binding.id, { action: next })}
                                            />
                                            <p className="mt-1 text-[11.5px] text-(--deck-fg-3)">{action.hint}</p>
                                        </div>
                                        {binding.action === EAction.ChatboxSend ? (
                                            <textarea
                                                value={binding.text}
                                                rows={2}
                                                maxLength={LIMITS.maxTemplateLength}
                                                spellCheck={false}
                                                placeholder="e.g. 👋 Hi from {weekday}!"
                                                aria-label="Chatbox text"
                                                className={cn(INPUT_CLASS, 'h-auto min-h-16 resize-y py-2 font-mono text-[12.5px]')}
                                                onInput={(event) => patch(binding.id, { text: event.currentTarget.value }, false)}
                                            />
                                        ) : null}
                                        {binding.action === EAction.SendOsc ? (
                                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_100px_170px]">
                                                <CommitInput
                                                    mono
                                                    value={binding.oscAddress}
                                                    label="Parameter to set"
                                                    onCommit={(address) => {
                                                        if (!isValidAddress(address.trim())) return false;
                                                        patch(binding.id, { oscAddress: address.trim() });
                                                        return true;
                                                    }}
                                                />
                                                <CommitInput
                                                    mono
                                                    inputMode="decimal"
                                                    value={String(binding.oscValue)}
                                                    label="Value"
                                                    onCommit={(raw) => {
                                                        const value = Number(raw.replace(',', '.'));
                                                        if (!raw.trim() || !Number.isFinite(value)) return false;
                                                        patch(binding.id, { oscValue: value });
                                                        return true;
                                                    }}
                                                />
                                                <Segmented
                                                    size="sm"
                                                    label="Type"
                                                    value={binding.oscType}
                                                    options={[
                                                        { value: EParamType.Bool, label: 'Bool' },
                                                        { value: EParamType.Int, label: 'Int' },
                                                        { value: EParamType.Float, label: 'Float' },
                                                    ]}
                                                    onChange={(oscType) => patch(binding.id, { oscType })}
                                                />
                                            </div>
                                        ) : null}
                                        <div className="flex justify-end">
                                            <IconButton
                                                icon="trash"
                                                label="Delete binding"
                                                danger
                                                onClick={() => {
                                                    setBindings(bindings.filter((entry) => entry.id !== binding.id));
                                                    setExpanded(null);
                                                }}
                                            />
                                        </div>
                                    </div>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
