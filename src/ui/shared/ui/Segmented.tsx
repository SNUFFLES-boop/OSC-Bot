import { cn } from '@/shared/lib/ui';

import { Icon, type IconName } from './Icon';

export type SegmentedOption<T extends string> = {
    value: T;
    label: string;
    icon?: IconName;
};

type SegmentedProps<T extends string> = {
    value: T;
    options: SegmentedOption<T>[];
    /** Accessible name of the group. */
    label: string;
    size?: 'sm' | 'md';
    onChange: (value: T) => void;
};

/** Equal-width single-choice button group with a sliding highlight. */
export function Segmented<T extends string>({ value, options, label, size = 'md', onChange }: SegmentedProps<T>) {
    const index = Math.max(
        0,
        options.findIndex((option) => option.value === value),
    );

    return (
        <fieldset
            aria-label={label}
            className={cn(
                'relative m-0 grid min-w-0 rounded-[10px] border border-white/10 bg-white/4 p-0.5',
                size === 'sm' ? 'h-8' : 'h-9.5',
            )}
            style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
        >
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0.5 rounded-[8px] border border-[color-mix(in_oklab,var(--deck-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--deck-accent)_16%,transparent)] shadow-[0_0_16px_-6px_var(--deck-accent)] transition-[left] duration-300 ease-out motion-reduce:transition-none"
                style={{
                    left: `calc(${(index / options.length) * 100}% + 2px)`,
                    width: `calc(${100 / options.length}% - 4px)`,
                }}
            />
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        className={cn(
                            'relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-[8px] px-1.5 font-semibold transition-colors',
                            size === 'sm' ? 'text-[11px]' : 'text-[12px]',
                            active ? 'text-(--deck-fg)' : 'text-(--deck-fg-3) hover:text-(--deck-fg-2)',
                        )}
                        onClick={() => onChange(option.value)}
                    >
                        {option.icon ? (
                            <Icon className={cn('size-3.5 shrink-0', active && 'text-(--deck-accent)')} name={option.icon} />
                        ) : null}
                        <span className="truncate">{option.label}</span>
                    </button>
                );
            })}
        </fieldset>
    );
}
