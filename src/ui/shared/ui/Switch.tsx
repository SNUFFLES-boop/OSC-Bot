import { cn } from '@/shared/lib/ui';

type SwitchProps = {
    checked: boolean;
    /** Accessible name; the switch has no visible text of its own. */
    label: string;
    disabled?: boolean;
    size?: 'sm' | 'md';
    onChange: (checked: boolean) => void;
};

export const Switch = ({ checked, label, disabled = false, size = 'md', onChange }: SwitchProps) => {
    const small = size === 'sm';

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            className={cn(
                'relative shrink-0 rounded-full border transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45',
                small ? 'h-5 w-8.5' : 'h-[26px] w-11',
                checked
                    ? 'border-(--deck-accent) bg-[color-mix(in_oklab,var(--deck-accent)_22%,transparent)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--deck-accent)_10%,transparent)]'
                    : 'border-white/10 bg-white/5',
            )}
            onClick={() => onChange(!checked)}
        >
            <span
                className={cn(
                    'absolute rounded-full transition-all duration-200',
                    small ? 'top-0.5 size-3.5' : 'top-0.5 size-5',
                    checked
                        ? cn(
                              'bg-(--deck-accent) shadow-[0_0_8px_color-mix(in_oklab,var(--deck-accent)_55%,transparent)]',
                              small ? 'left-4' : 'left-5',
                          )
                        : 'left-0.5 bg-(--deck-fg-3)',
                )}
            />
        </button>
    );
};
