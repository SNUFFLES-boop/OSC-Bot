import { type ReactNode, useEffect, useState } from 'react';

import { cn } from '@/shared/lib/ui';

import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';

const COLLAPSE_MS = 320;

type PanelProps = {
    id: string;
    title: string;
    subtitle: string;
    icon: IconName;
    badge?: ReactNode;
    actions?: ReactNode;
    /** Board layout only: the card can collapse, move and hide. */
    board?: {
        collapsed: boolean;
        hidden: boolean;
        customizing: boolean;
        canMoveUp: boolean;
        canMoveDown: boolean;
        onToggleCollapsed: () => void;
        onMove: (direction: -1 | 1) => void;
        onToggleHidden: () => void;
    };
    children: ReactNode;
};

/** A section card. In the tabs layout it is always open; on the board it is a movable card. */
export const Panel = ({ id, title, subtitle, icon, badge, actions, board, children }: PanelProps) => {
    const open = !board || (!board.collapsed && !board.customizing);
    // Collapsed bodies stop rendering after the animation, so live updates only cost what is shown.
    const [mounted, setMounted] = useState(open);

    useEffect(() => {
        if (open) {
            setMounted(true);
            return;
        }
        const timer = window.setTimeout(() => setMounted(false), COLLAPSE_MS);
        return () => window.clearTimeout(timer);
    }, [open]);

    return (
        <section
            id={`panel-${id}`}
            className={cn(
                'mb-3 break-inside-avoid overflow-hidden rounded-[18px] border bg-white/3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] transition-[opacity,border-color] duration-300',
                board?.customizing ? 'border-dashed border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)]' : 'border-white/10',
                board?.hidden && 'opacity-45',
            )}
        >
            <div className="flex items-center gap-2.5 px-4 py-3">
                <button
                    type="button"
                    aria-expanded={open}
                    disabled={!board || board.customizing}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:cursor-default"
                    onClick={board?.onToggleCollapsed}
                >
                    <span className="flex size-8.5 shrink-0 items-center justify-center rounded-[10px] border border-[color-mix(in_oklab,var(--deck-accent)_26%,transparent)] bg-[color-mix(in_oklab,var(--deck-accent)_9%,transparent)] text-(--deck-accent)">
                        <Icon className="size-4.5" name={icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-semibold text-(--deck-fg)">{title}</span>
                            {badge}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[10.5px] text-(--deck-fg-4)">{subtitle}</span>
                    </span>
                    {board && !board.customizing ? (
                        <Icon
                            className={cn(
                                'size-4 shrink-0 text-(--deck-fg-3) transition-transform duration-300',
                                open ? 'rotate-0' : '-rotate-90',
                            )}
                            name="chevron-down"
                        />
                    ) : null}
                </button>
                {board?.customizing ? (
                    <div className="flex shrink-0 items-center gap-1">
                        <IconButton
                            size="sm"
                            icon="arrow-up"
                            label={`Move ${title} up`}
                            disabled={!board.canMoveUp}
                            onClick={() => board.onMove(-1)}
                        />
                        <IconButton
                            size="sm"
                            icon="arrow-down"
                            label={`Move ${title} down`}
                            disabled={!board.canMoveDown}
                            onClick={() => board.onMove(1)}
                        />
                        <IconButton
                            size="sm"
                            icon={board.hidden ? 'eye-off' : 'eye'}
                            label={board.hidden ? `Show ${title}` : `Hide ${title}`}
                            active={!board.hidden}
                            onClick={board.onToggleHidden}
                        />
                    </div>
                ) : (
                    actions
                )}
            </div>
            <div
                className={cn(
                    'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
                    open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
            >
                <div className="min-h-0 overflow-hidden">
                    {open || mounted ? <div className="border-t border-white/6 px-4 pb-4 pt-3.5">{children}</div> : null}
                </div>
            </div>
        </section>
    );
};

export const SettingRow = ({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) => (
    <div className="flex items-center gap-3 py-2">
        <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-(--deck-fg)">{title}</div>
            {description ? <div className="mt-0.5 text-[11.5px] leading-snug text-(--deck-fg-3)">{description}</div> : null}
        </div>
        <div className="flex shrink-0 items-center">{children}</div>
    </div>
);

export const Group = ({ title, children, className }: { title?: string; children: ReactNode; className?: string }) => (
    <div className={className}>
        {title ? <Eyebrow>{title}</Eyebrow> : null}
        <div className="rounded-[13px] border border-white/8 bg-black/15 px-3">{children}</div>
    </div>
);

export const Eyebrow = ({ children }: { children: ReactNode }) => (
    <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-(--deck-fg-4)">{children}</div>
);

type RangeFieldProps = {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    format: (value: number) => string;
    onChange: (value: number) => void;
};

export const RangeField = ({ label, value, min, max, step = 1, format, onChange }: RangeFieldProps) => {
    const fill = max === min ? 0 : ((value - min) / (max - min)) * 100;
    return (
        <label className="block py-2">
            <span className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-(--deck-fg)">{label}</span>
                <span className="rounded-[6px] bg-[color-mix(in_oklab,var(--deck-accent)_12%,transparent)] px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-(--deck-accent)">
                    {format(value)}
                </span>
            </span>
            <input
                type="range"
                className="osc-range w-full"
                aria-label={label}
                min={min}
                max={max}
                step={step}
                value={value}
                style={{ '--fill': `${fill}%` } as Record<string, string>}
                onInput={(event) => onChange(Number(event.currentTarget.value))}
            />
        </label>
    );
};

export const StatusDot = ({ tone }: { tone: 'ok' | 'warn' | 'error' | 'off' }) => (
    <span
        className={cn(
            'size-2 shrink-0 rounded-full',
            tone === 'ok' && 'bg-(--deck-accent) shadow-[0_0_8px_var(--deck-accent)] motion-safe:animate-[breathe_2s_ease-in-out_infinite]',
            tone === 'warn' && 'bg-amber-300 shadow-[0_0_8px_#fcd34d]',
            tone === 'error' && 'bg-red-400 shadow-[0_0_8px_#f87171]',
            tone === 'off' && 'bg-white/20',
        )}
    />
);

export const PrimaryButton = ({
    icon,
    children,
    disabled,
    onClick,
    type = 'button',
}: {
    icon?: IconName;
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
    type?: 'button' | 'submit';
}) => (
    <button
        type={type}
        disabled={disabled}
        className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-(--deck-accent) px-3.5 text-[12.5px] font-bold text-black shadow-[0_8px_24px_-12px_var(--deck-accent)] transition-transform active:scale-[0.97] disabled:opacity-40"
        onClick={onClick}
    >
        {icon ? <Icon className="size-3.5" name={icon} stroke={2.2} /> : null}
        {children}
    </button>
);

export const GhostButton = ({
    icon,
    children,
    danger,
    disabled,
    onClick,
}: {
    icon?: IconName;
    children: ReactNode;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
}) => (
    <button
        type="button"
        disabled={disabled}
        className={cn(
            'flex h-9.5 items-center justify-center gap-1.5 rounded-[10px] border px-3 text-[12px] font-semibold transition-colors disabled:opacity-40',
            danger
                ? 'border-red-400/25 bg-red-500/8 text-red-300 hover:bg-red-500/15'
                : 'border-white/10 bg-white/4 text-(--deck-fg-2) hover:bg-white/7 hover:text-(--deck-fg)',
        )}
        onClick={onClick}
    >
        {icon ? <Icon className="size-3.5" name={icon} /> : null}
        {children}
    </button>
);

export const SelectField = <T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: T;
    options: { value: T; label: string }[];
    onChange: (value: T) => void;
}) => (
    <select
        aria-label={label}
        value={value}
        className="remote-glass-control h-10 w-full min-w-0 appearance-none rounded-[10px] border px-3 text-[13px] text-(--deck-fg) outline-none"
        onChange={(event) => onChange(event.currentTarget.value as T)}
    >
        {options.map((option) => (
            <option key={option.value} value={option.value}>
                {option.label}
            </option>
        ))}
    </select>
);
