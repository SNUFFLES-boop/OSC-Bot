import { type FormEvent, type KeyboardEvent, useEffect, useState } from 'react';

import { cn } from '@/shared/lib/ui';

export const INPUT_CLASS =
    'remote-glass-control h-10 w-full min-w-0 rounded-[10px] border px-3 text-[13px] text-(--deck-fg) outline-none transition-colors placeholder:text-(--deck-fg-4) focus:border-[color-mix(in_oklab,var(--deck-accent)_55%,transparent)]';

type CommitInputProps = {
    value: string;
    /** Accessible name. */
    label: string;
    placeholder?: string;
    mono?: boolean;
    inputMode?: 'text' | 'numeric' | 'decimal';
    /** Id of a <datalist> with suggestions. */
    list?: string;
    type?: 'text' | 'password';
    className?: string;
    /** Returns false to reject the draft; it stays visible and is marked invalid. */
    onCommit: (value: string) => boolean;
};

/**
 * Text input with commit-on-blur/Enter semantics, for values that are only meaningful when
 * complete (ports, hosts, OSC addresses): a half-typed value is never sent. Escape reverts.
 */
export const CommitInput = ({
    value,
    label,
    placeholder,
    mono = false,
    inputMode = 'text',
    list,
    type = 'text',
    className,
    onCommit,
}: CommitInputProps) => {
    const [draft, setDraft] = useState(value);
    const [invalid, setInvalid] = useState(false);

    useEffect(() => {
        setDraft(value);
        setInvalid(false);
    }, [value]);

    const commit = () => {
        if (draft === value) {
            setInvalid(false);
            return;
        }
        setInvalid(!onCommit(draft));
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.currentTarget.blur();
        } else if (event.key === 'Escape') {
            setDraft(value);
            setInvalid(false);
        }
    };

    return (
        <input
            value={draft}
            aria-label={label}
            aria-invalid={invalid || undefined}
            placeholder={placeholder}
            inputMode={inputMode}
            list={list}
            type={type}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            className={cn(INPUT_CLASS, mono && 'font-mono text-[12.5px]', invalid && 'border-red-400/60 text-red-200', className)}
            onInput={(event: FormEvent<HTMLInputElement>) => {
                setDraft(event.currentTarget.value);
                setInvalid(false);
            }}
            onBlur={commit}
            onKeyDown={handleKeyDown}
        />
    );
};
