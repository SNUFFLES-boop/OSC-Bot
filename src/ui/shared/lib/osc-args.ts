import type { ArgPreview as OscArgPreview } from '../../../shared/protocol';

const TOKEN_PATTERN = /"([^"]*)"|'([^']*)'|(\S+)/g;
const EXPLICIT_TYPES = new Set(['i', 'f', 'd', 's']);

/**
 * Parses composer input like `1 0.5 "hello world" true i:3 f:1` into typed OSC arguments.
 * Integers become `i`, decimals `f`, true/false `T`/`F`, nil `N`; `x:` prefixes force a type.
 */
export function parseOscArgs(input: string): OscArgPreview[] {
    const args: OscArgPreview[] = [];
    for (const match of input.matchAll(TOKEN_PATTERN)) {
        const quoted = match[1] ?? match[2];
        if (quoted !== undefined) {
            args.push({ type: 's', value: quoted });
            continue;
        }
        args.push(parseToken(match[3]));
    }
    return args;
}

function parseToken(token: string): OscArgPreview {
    const explicit = /^([a-z]):(.*)$/i.exec(token);
    if (explicit && EXPLICIT_TYPES.has(explicit[1].toLowerCase())) {
        const type = explicit[1].toLowerCase();
        const raw = explicit[2];
        if (type === 's') return { type: 's', value: raw };
        const value = Number(raw);
        return Number.isFinite(value) ? { type, value: type === 'i' ? Math.trunc(value) : value } : { type: 's', value: raw };
    }

    const lower = token.toLowerCase();
    if (lower === 'true' || token === 'T') return { type: 'T', value: true };
    if (lower === 'false' || token === 'F') return { type: 'F', value: false };
    if (lower === 'nil' || lower === 'null' || token === 'N') return { type: 'N', value: null };
    if (/^[-+]?\d+$/.test(token)) return { type: 'i', value: Number(token) };
    if (/^[-+]?(\d+\.\d*|\.\d+|\d+(\.\d+)?e[-+]?\d+)$/i.test(token)) {
        return { type: 'f', value: Number(token) };
    }
    return { type: 's', value: token };
}

export function formatOscArg(arg: OscArgPreview): string {
    if (arg.type === 'T') return 'true';
    if (arg.type === 'F') return 'false';
    if (arg.type === 'N') return 'nil';
    if (arg.type === 'I') return 'impulse';
    if (arg.type === 's' || arg.type === 'S') return `"${String(arg.value)}"`;
    return String(arg.value);
}
