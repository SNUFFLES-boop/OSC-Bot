import { type FormEvent, useEffect, useRef, useState } from 'react';

import { cn } from '@/shared/lib/ui';
import { useNow } from '@/shared/lib/use-now';
import { INPUT_CLASS } from '@/shared/ui/CommitInput';
import { Icon } from '@/shared/ui/Icon';
import { IconButton } from '@/shared/ui/IconButton';
import { Eyebrow, Group, RangeField, SelectField, SettingRow } from '@/shared/ui/Panel';
import { Switch } from '@/shared/ui/Switch';
import { type BotConfig, type ChatMessage, createMessage, ECondition, LIMITS } from '../../../shared/config';
import type { LiveState } from '../../../shared/protocol';
import { chatboxLength, conditionMet, renderTemplate, TOKENS, type TokenGroup } from '../../../shared/template';
import type { SectionProps } from '../../app/section-props';

const CONDITIONS: { value: ECondition; label: string }[] = [
    { value: ECondition.Always, label: 'Always' },
    { value: ECondition.MusicPlaying, label: 'While music plays' },
    { value: ECondition.NoMusic, label: 'When no music' },
    { value: ECondition.HeartRate, label: 'With heart rate' },
    { value: ECondition.Active, label: 'When not AFK' },
    { value: ECondition.Afk, label: 'When AFK' },
];

const GROUP_LABELS: Record<TokenGroup, string> = {
    time: 'Time',
    music: 'Music',
    system: 'PC',
    body: 'You',
    world: 'Weather',
    vrchat: 'VRChat',
};

type FieldKey = { kind: 'message'; id: string } | { kind: 'afk' } | { kind: 'song' };

export const ChatboxSection = ({ config, status, live, update, command }: SectionProps) => {
    const chat = config.chatbox;
    const focused = useRef<{ key: FieldKey; element: HTMLTextAreaElement | HTMLInputElement } | null>(null);
    const now = new Date();

    const patch = (change: Partial<BotConfig['chatbox']>, immediate = false) =>
        update((current) => ({ ...current, chatbox: { ...current.chatbox, ...change } }), immediate);
    const patchMessage = (id: string, change: Partial<ChatMessage>, immediate = false) =>
        patch({ messages: chat.messages.map((message) => (message.id === id ? { ...message, ...change } : message)) }, immediate);
    const moveMessage = (index: number, direction: -1 | 1) => {
        const messages = [...chat.messages];
        const swap = index + direction;
        if (swap < 0 || swap >= messages.length) return;
        [messages[index], messages[swap]] = [messages[swap], messages[index]];
        patch({ messages }, true);
    };

    const remember = (key: FieldKey) => (event: { currentTarget: HTMLTextAreaElement | HTMLInputElement }) => {
        focused.current = { key, element: event.currentTarget };
    };

    const writeField = (key: FieldKey, value: string) => {
        if (key.kind === 'message') patchMessage(key.id, { text: value });
        else if (key.kind === 'afk') patch({ afkMessage: value });
        else patch({ songTemplate: value });
    };

    // Tokens land at the caret of the field focused last (the last message by default).
    const insertToken = (token: string) => {
        const target = focused.current;
        if (!target) {
            const last = chat.messages[chat.messages.length - 1];
            if (last) patchMessage(last.id, { text: `${last.text}${token}` });
            else patch({ messages: [createMessage(token)] }, true);
            return;
        }
        const { element, key } = target;
        const start = element.selectionStart ?? element.value.length;
        const end = element.selectionEnd ?? start;
        writeField(key, `${element.value.slice(0, start)}${token}${element.value.slice(end)}`);
        requestAnimationFrame(() => {
            element.focus();
            element.setSelectionRange(start + token.length, start + token.length);
        });
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-3">
                    <ChatboxPreview
                        chat={chat}
                        live={live}
                        paused={status.chatboxPaused}
                        lastSent={status.lastChatbox}
                        lastSentAt={status.lastChatboxAt}
                    />
                    <Group>
                        <SettingRow title="Chatbox bot" description="Rotate the messages below above your avatar.">
                            <Switch checked={chat.enabled} label="Chatbox bot" onChange={(enabled) => patch({ enabled }, true)} />
                        </SettingRow>
                        <SettingRow title="Paused" description="Temporarily stop and clear the chatbox (also from the tray or a binding).">
                            <Switch
                                checked={status.chatboxPaused}
                                label="Pause chatbox"
                                onChange={() => command({ action: 'chatbox_toggle' })}
                            />
                        </SettingRow>
                        <div className="border-t border-white/6">
                            <RangeField
                                label="Rotate every"
                                value={chat.intervalSeconds}
                                min={LIMITS.minIntervalSeconds}
                                max={30}
                                format={(value) => `${value}s`}
                                onChange={(intervalSeconds) => patch({ intervalSeconds })}
                            />
                        </div>
                        <div className="border-t border-white/6">
                            <SettingRow title="Notification sound" description="VRChat's chime for one-off messages.">
                                <Switch
                                    checked={chat.notifySound}
                                    label="Notification sound"
                                    onChange={(notifySound) => patch({ notifySound }, true)}
                                />
                            </SettingRow>
                            <SettingRow title="Typing indicator" description="Show the typing bubble before each message.">
                                <Switch
                                    checked={chat.typingIndicator}
                                    label="Typing indicator"
                                    onChange={(typingIndicator) => patch({ typingIndicator }, true)}
                                />
                            </SettingRow>
                        </div>
                    </Group>
                </div>

                <div className="space-y-3">
                    <TokenPalette params={Object.keys(live.params)} onInsert={insertToken} />
                    <div>
                        <Eyebrow>While AFK</Eyebrow>
                        <input
                            value={chat.afkMessage}
                            spellCheck={false}
                            placeholder="Empty keeps rotating while AFK"
                            aria-label="AFK message"
                            className={cn(INPUT_CLASS, 'font-mono text-[12.5px]')}
                            onFocus={remember({ kind: 'afk' })}
                            onSelect={remember({ kind: 'afk' })}
                            onInput={(event) => patch({ afkMessage: event.currentTarget.value })}
                        />
                    </div>
                    <Group>
                        <SettingRow title="Announce new songs" description="Pop a message when the track changes.">
                            <Switch
                                checked={chat.announceSongs}
                                label="Announce new songs"
                                onChange={(announceSongs) => patch({ announceSongs }, true)}
                            />
                        </SettingRow>
                        {chat.announceSongs ? (
                            <div className="pb-3">
                                <input
                                    value={chat.songTemplate}
                                    spellCheck={false}
                                    aria-label="Song announcement"
                                    className={cn(INPUT_CLASS, 'font-mono text-[12.5px]')}
                                    onFocus={remember({ kind: 'song' })}
                                    onSelect={remember({ kind: 'song' })}
                                    onInput={(event) => patch({ songTemplate: event.currentTarget.value })}
                                />
                            </div>
                        ) : null}
                    </Group>
                </div>
            </div>

            <div>
                <Eyebrow>Rotation · {chat.messages.filter((message) => message.enabled).length} active</Eyebrow>
                <div className="grid gap-2 xl:grid-cols-2">
                    {chat.messages.map((message, index) => {
                        const rendered = renderTemplate(message.text, { now, live, seed: index });
                        const shown = conditionMet(message.condition, live);
                        return (
                            <div
                                key={message.id}
                                className={cn(
                                    'rounded-[13px] border bg-black/15 p-2.5 motion-safe:animate-[osc-rise_220ms_ease-out]',
                                    message.enabled ? 'border-white/8' : 'border-white/5 opacity-60',
                                )}
                            >
                                <div className="mb-2 flex items-center gap-1.5">
                                    <Switch
                                        size="sm"
                                        checked={message.enabled}
                                        label={`Message ${index + 1}`}
                                        onChange={(enabled) => patchMessage(message.id, { enabled }, true)}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <SelectField
                                            label={`When to show message ${index + 1}`}
                                            value={message.condition}
                                            options={CONDITIONS}
                                            onChange={(condition) => patchMessage(message.id, { condition }, true)}
                                        />
                                    </div>
                                    <IconButton
                                        size="sm"
                                        icon="arrow-up"
                                        label="Move up"
                                        disabled={index === 0}
                                        onClick={() => moveMessage(index, -1)}
                                    />
                                    <IconButton
                                        size="sm"
                                        icon="arrow-down"
                                        label="Move down"
                                        disabled={index === chat.messages.length - 1}
                                        onClick={() => moveMessage(index, 1)}
                                    />
                                    <IconButton
                                        size="sm"
                                        icon="trash"
                                        label="Delete message"
                                        onClick={() => patch({ messages: chat.messages.filter((entry) => entry.id !== message.id) }, true)}
                                    />
                                </div>
                                <textarea
                                    value={message.text}
                                    rows={2}
                                    maxLength={LIMITS.maxTemplateLength}
                                    spellCheck={false}
                                    aria-label={`Message ${index + 1}`}
                                    className={cn(INPUT_CLASS, 'h-auto min-h-16 resize-y py-2 font-mono text-[12.5px] leading-relaxed')}
                                    onFocus={remember({ kind: 'message', id: message.id })}
                                    onSelect={remember({ kind: 'message', id: message.id })}
                                    onInput={(event) => patchMessage(message.id, { text: event.currentTarget.value })}
                                />
                                <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                                    <span className={cn('min-w-0 flex-1 truncate', shown ? 'text-(--deck-fg-3)' : 'text-(--deck-fg-4)')}>
                                        {!shown
                                            ? 'Skipped right now (condition)'
                                            : rendered.trim()
                                              ? rendered.replace(/\n/g, ' ⏎ ')
                                              : 'Renders empty right now'}
                                    </span>
                                    <span
                                        className={cn(
                                            'font-mono tabular-nums',
                                            chatboxLength(rendered) >= LIMITS.chatboxMaxChars ? 'text-red-300' : 'text-(--deck-fg-4)',
                                        )}
                                    >
                                        {chatboxLength(rendered)}/{LIMITS.chatboxMaxChars}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {chat.messages.length < LIMITS.maxMessages ? (
                    <button
                        type="button"
                        className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-white/15 text-[12px] font-semibold text-(--deck-fg-3) hover:border-[color-mix(in_oklab,var(--deck-accent)_50%,transparent)] hover:text-(--deck-accent)"
                        onClick={() => patch({ messages: [...chat.messages, createMessage()] }, true)}
                    >
                        <Icon className="size-3.5" name="plus" stroke={2} />
                        Add message
                    </button>
                ) : null}
            </div>

            <QuickPhrases phrases={chat.quickPhrases} onChange={(quickPhrases) => patch({ quickPhrases }, true)} />
        </div>
    );
};

const TokenPalette = ({ params, onInsert }: { params: string[]; onInsert: (token: string) => void }) => {
    const groups = Object.keys(GROUP_LABELS) as TokenGroup[];
    const [param, setParam] = useState('');
    return (
        <div>
            <Eyebrow>Insert token</Eyebrow>
            <div className="space-y-1.5 rounded-[13px] border border-white/8 bg-black/15 p-2.5">
                {groups.map((group) => (
                    <div key={group} className="flex flex-wrap items-center gap-1">
                        <span className="w-14 shrink-0 font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-(--deck-fg-4)">
                            {GROUP_LABELS[group]}
                        </span>
                        {TOKENS.filter((token) => token.group === group).map((token) => (
                            <button
                                key={token.token}
                                type="button"
                                title={`{${token.token}}`}
                                className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-(--deck-fg-2) transition-colors hover:border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)] hover:text-(--deck-accent) active:scale-95"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => onInsert(`{${token.token}}`)}
                            >
                                {token.label}
                            </button>
                        ))}
                    </div>
                ))}
                <div className="flex flex-wrap items-center gap-1 border-t border-white/6 pt-1.5">
                    <span className="w-14 shrink-0 font-mono text-[9.5px] font-bold uppercase tracking-[0.12em] text-(--deck-fg-4)">
                        More
                    </span>
                    {[
                        ['{time:Asia/Tokyo}', 'Other time zone'],
                        ['{random:hi|hey|yo}', 'Random pick'],
                        ['{countdown:2027-01-01}', 'Countdown'],
                    ].map(([token, label]) => (
                        <button
                            key={token}
                            type="button"
                            title={token}
                            className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-(--deck-fg-2) hover:text-(--deck-accent)"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onInsert(token)}
                        >
                            {label}
                        </button>
                    ))}
                    <select
                        aria-label="Insert an avatar parameter"
                        value={param}
                        className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-(--deck-fg-2) outline-none"
                        onChange={(event) => {
                            const value = event.currentTarget.value;
                            setParam('');
                            if (value) onInsert(`{param:${value}}`);
                        }}
                    >
                        <option value="">{params.length ? 'Avatar parameter…' : 'No avatar parameters seen yet'}</option>
                        {params.sort().map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
};

const QuickPhrases = ({ phrases, onChange }: { phrases: string[]; onChange: (phrases: string[]) => void }) => {
    const [draft, setDraft] = useState('');
    const add = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const phrase = draft.trim();
        if (!phrase || phrases.includes(phrase) || phrases.length >= LIMITS.maxQuickPhrases) return;
        onChange([...phrases, phrase]);
        setDraft('');
    };
    return (
        <div>
            <Eyebrow>Quick phrases (one tap on the dashboard)</Eyebrow>
            <div className="flex flex-wrap gap-1.5">
                {phrases.map((phrase) => (
                    <span
                        key={phrase}
                        className="inline-flex items-center overflow-hidden rounded-full border border-white/10 bg-white/5 text-[12px] text-(--deck-fg-2)"
                    >
                        <span className="px-3 py-1">{phrase}</span>
                        <button
                            type="button"
                            aria-label={`Remove ${phrase}`}
                            className="flex h-7 w-7 items-center justify-center border-l border-white/10 text-(--deck-fg-4) hover:text-(--deck-fg)"
                            onClick={() => onChange(phrases.filter((entry) => entry !== phrase))}
                        >
                            <Icon className="size-3" name="x" stroke={2.2} />
                        </button>
                    </span>
                ))}
                <form className="flex" onSubmit={add}>
                    <input
                        value={draft}
                        maxLength={LIMITS.chatboxMaxChars}
                        placeholder="Add phrase…"
                        aria-label="New quick phrase"
                        className="h-7.5 w-36 rounded-full border border-dashed border-white/15 bg-transparent px-3 text-[12px] text-(--deck-fg) outline-none placeholder:text-(--deck-fg-4) focus:border-(--deck-accent)"
                        onInput={(event) => setDraft(event.currentTarget.value)}
                    />
                </form>
            </div>
        </div>
    );
};

/** Plays the rotation exactly as VRChat will show it, with live tokens and conditions. */
const ChatboxPreview = ({
    chat,
    live,
    paused,
    lastSent,
    lastSentAt,
}: {
    chat: BotConfig['chatbox'];
    live: LiveState;
    paused: boolean;
    lastSent: string | null;
    lastSentAt: string | null;
}) => {
    const now = useNow(1000);
    const [tick, setTick] = useState(0);
    const running = chat.enabled && !paused;
    const candidates = chat.messages.filter((message) => message.enabled && conditionMet(message.condition, live));
    const rendered = candidates
        .map((message, index) => renderTemplate(message.text, { now, live, seed: tick + index }))
        .filter((text) => text.trim());
    const afkText = live.afk && chat.afkMessage.trim() ? renderTemplate(chat.afkMessage, { now, live, seed: tick }) : null;
    const text = afkText ?? rendered[tick % Math.max(1, rendered.length)] ?? '';
    const length = chatboxLength(text);

    useEffect(() => {
        if (!running) return;
        const timer = window.setInterval(() => setTick((value) => value + 1), chat.intervalSeconds * 1000);
        return () => window.clearInterval(timer);
    }, [running, chat.intervalSeconds]);

    const ago = lastSentAt ? Math.max(0, Math.round((now.getTime() - Date.parse(lastSentAt)) / 1000)) : null;
    const ratio = Math.min(1, length / LIMITS.chatboxMaxChars);

    return (
        <div className="overflow-hidden rounded-[16px] border border-white/10">
            <div className="relative flex min-h-40 flex-col items-center justify-end bg-[radial-gradient(ellipse_at_50%_120%,rgba(120,90,255,.38),transparent_60%),linear-gradient(180deg,#151a2e,#0b0d16)] px-4 pb-4 pt-6">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.08)_0_1px,transparent_1.5px),radial-gradient(circle_at_70%_35%,rgba(255,255,255,.06)_0_1px,transparent_1.5px),radial-gradient(circle_at_45%_12%,rgba(255,255,255,.07)_0_1px,transparent_1.5px)]" />
                <div
                    key={`${tick}-${text}`}
                    className={cn(
                        'relative max-w-[92%] rounded-[14px] border border-white/15 bg-[rgba(18,20,28,.88)] px-3.5 py-2.5 text-center text-[13.5px] leading-snug text-white shadow-[0_12px_32px_rgba(0,0,0,.45)] motion-safe:animate-[osc-rise_280ms_ease-out]',
                        !running && 'opacity-50 grayscale',
                    )}
                >
                    {text ? (
                        <span className="whitespace-pre-wrap break-words">{text}</span>
                    ) : (
                        <span className="text-white/45">Chatbox stays empty</span>
                    )}
                    <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-b border-r border-white/15 bg-[rgba(18,20,28,.88)]" />
                </div>
                <div className="relative mt-3 rounded-full bg-black/45 px-2.5 py-0.5 text-[10.5px] font-semibold text-white/80">You</div>
                <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-black/40 py-0.5 pl-1 pr-2">
                    <svg aria-hidden="true" className="size-5 -rotate-90" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" />
                        <circle
                            cx="12"
                            cy="12"
                            r="9"
                            fill="none"
                            stroke={ratio >= 1 ? '#fca5a5' : 'var(--deck-accent)'}
                            strokeDasharray={56.5}
                            strokeDashoffset={56.5 * (1 - ratio)}
                            strokeLinecap="round"
                            strokeWidth="3"
                            className="transition-[stroke-dashoffset] duration-500"
                        />
                    </svg>
                    <span className="font-mono text-[10px] font-bold tabular-nums text-white/80">
                        {length}/{LIMITS.chatboxMaxChars}
                    </span>
                </div>
                {paused ? (
                    <span className="absolute left-2.5 top-2.5 rounded-full bg-amber-400/20 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-200">
                        PAUSED
                    </span>
                ) : null}
            </div>
            {running && rendered.length > 0 && !afkText ? (
                <div className="h-0.5 bg-white/5">
                    <div
                        key={tick}
                        className="h-full origin-left bg-(--deck-accent) motion-safe:animate-[osc-progress_linear_both]"
                        style={{ animationDuration: `${chat.intervalSeconds}s` }}
                    />
                </div>
            ) : null}
            <div className="flex items-center justify-between gap-2 bg-black/25 px-3 py-2 font-mono text-[10.5px] text-(--deck-fg-4)">
                <span>
                    {afkText
                        ? 'AFK message'
                        : `Message ${rendered.length ? (tick % rendered.length) + 1 : 0} of ${rendered.length} · every ${chat.intervalSeconds}s`}
                </span>
                <span className="truncate text-right">
                    {lastSent !== null && ago !== null ? (lastSent ? `Sent ${ago}s ago` : `Cleared ${ago}s ago`) : 'Nothing sent yet'}
                </span>
            </div>
        </div>
    );
};
