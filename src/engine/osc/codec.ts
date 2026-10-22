import type { ArgPreview as OscArgPreview } from '../../shared/protocol';

/**
 * Minimal OSC 1.0 codec (plus the common 1.1 tags VRChat, TouchOSC and Open Stage Control
 * emit). The bridge runs inside Wand's main process, so it stays dependency-free.
 */

export type OscArg =
    | { type: 'i' | 'f' | 'd' | 'h' | 't' | 'r'; value: number }
    | { type: 's' | 'S' | 'c'; value: string }
    | { type: 'b' | 'm'; value: Buffer }
    | { type: 'T'; value: true }
    | { type: 'F'; value: false }
    | { type: 'N' | 'I'; value: null };

export type OscMessage = {
    address: string;
    args: OscArg[];
};

export class OscDecodeError extends Error {}

const BUNDLE_TAG = '#bundle';
const MAX_BUNDLE_DEPTH = 4;

export function decodePacket(buffer: Buffer, depth = 0): OscMessage[] {
    if (buffer.length === 0 || buffer.length % 4 !== 0) {
        throw new OscDecodeError('OSC packets must be a non-empty multiple of 4 bytes.');
    }

    if (buffer[0] === 0x23) {
        return decodeBundle(buffer, depth);
    }

    return [decodeMessage(buffer)];
}

function decodeBundle(buffer: Buffer, depth: number): OscMessage[] {
    if (depth >= MAX_BUNDLE_DEPTH) {
        throw new OscDecodeError('OSC bundles are nested too deeply.');
    }

    const header = readString(buffer, 0);
    if (header.value !== BUNDLE_TAG || buffer.length < header.next + 8) {
        throw new OscDecodeError('Malformed OSC bundle header.');
    }

    const messages: OscMessage[] = [];
    let offset = header.next + 8;
    while (offset < buffer.length) {
        if (offset + 4 > buffer.length) {
            throw new OscDecodeError('Truncated OSC bundle element.');
        }
        const size = buffer.readInt32BE(offset);
        offset += 4;
        if (size <= 0 || offset + size > buffer.length) {
            throw new OscDecodeError('OSC bundle element size is out of range.');
        }
        messages.push(...decodePacket(buffer.subarray(offset, offset + size), depth + 1));
        offset += size;
    }

    return messages;
}

function decodeMessage(buffer: Buffer): OscMessage {
    const address = readString(buffer, 0);
    if (!address.value.startsWith('/')) {
        throw new OscDecodeError('OSC address must start with "/".');
    }

    if (address.next >= buffer.length) {
        // Type tags are optional in OSC 1.0; a bare address is an impulse.
        return { address: address.value, args: [] };
    }

    const tags = readString(buffer, address.next);
    if (!tags.value.startsWith(',')) {
        throw new OscDecodeError('OSC type tag string must start with ",".');
    }

    const args: OscArg[] = [];
    let offset = tags.next;
    for (const tag of tags.value.slice(1)) {
        switch (tag) {
            case 'i':
                ensure(buffer, offset, 4);
                args.push({ type: 'i', value: buffer.readInt32BE(offset) });
                offset += 4;
                break;
            case 'f':
                ensure(buffer, offset, 4);
                args.push({ type: 'f', value: buffer.readFloatBE(offset) });
                offset += 4;
                break;
            case 'r':
                ensure(buffer, offset, 4);
                args.push({ type: 'r', value: buffer.readUInt32BE(offset) });
                offset += 4;
                break;
            case 'c':
                ensure(buffer, offset, 4);
                args.push({ type: 'c', value: String.fromCodePoint(buffer.readUInt32BE(offset)) });
                offset += 4;
                break;
            case 'm':
                ensure(buffer, offset, 4);
                args.push({ type: 'm', value: Buffer.from(buffer.subarray(offset, offset + 4)) });
                offset += 4;
                break;
            case 'd':
                ensure(buffer, offset, 8);
                args.push({ type: 'd', value: buffer.readDoubleBE(offset) });
                offset += 8;
                break;
            case 'h':
                ensure(buffer, offset, 8);
                args.push({ type: 'h', value: Number(buffer.readBigInt64BE(offset)) });
                offset += 8;
                break;
            case 't':
                ensure(buffer, offset, 8);
                args.push({ type: 't', value: Number(buffer.readBigUInt64BE(offset)) });
                offset += 8;
                break;
            case 's':
            case 'S': {
                const value = readString(buffer, offset);
                args.push({ type: tag, value: value.value });
                offset = value.next;
                break;
            }
            case 'b': {
                ensure(buffer, offset, 4);
                const size = buffer.readInt32BE(offset);
                offset += 4;
                if (size < 0) {
                    throw new OscDecodeError('Negative OSC blob size.');
                }
                ensure(buffer, offset, size);
                args.push({
                    type: 'b',
                    value: Buffer.from(buffer.subarray(offset, offset + size)),
                });
                offset += pad4(size);
                break;
            }
            case 'T':
                args.push({ type: 'T', value: true });
                break;
            case 'F':
                args.push({ type: 'F', value: false });
                break;
            case 'N':
            case 'I':
                args.push({ type: tag, value: null });
                break;
            case '[':
            case ']':
                // Arrays are flattened: bindings only ever read positional arguments.
                break;
            default:
                throw new OscDecodeError(`Unsupported OSC type tag "${tag}".`);
        }
    }

    return { address: address.value, args };
}

export function encodeMessage(address: string, args: OscArg[]): Buffer {
    const chunks: Buffer[] = [encodeString(address)];
    let tags = ',';
    const data: Buffer[] = [];

    for (const arg of args) {
        tags += arg.type;
        switch (arg.type) {
            case 'i': {
                const chunk = Buffer.alloc(4);
                chunk.writeInt32BE(clampInt32(arg.value));
                data.push(chunk);
                break;
            }
            case 'f': {
                const chunk = Buffer.alloc(4);
                chunk.writeFloatBE(arg.value);
                data.push(chunk);
                break;
            }
            case 'r': {
                const chunk = Buffer.alloc(4);
                chunk.writeUInt32BE(arg.value >>> 0);
                data.push(chunk);
                break;
            }
            case 'c': {
                const chunk = Buffer.alloc(4);
                chunk.writeUInt32BE(arg.value.codePointAt(0) ?? 0);
                data.push(chunk);
                break;
            }
            case 'd': {
                const chunk = Buffer.alloc(8);
                chunk.writeDoubleBE(arg.value);
                data.push(chunk);
                break;
            }
            case 'h':
            case 't': {
                const chunk = Buffer.alloc(8);
                chunk.writeBigInt64BE(BigInt(Math.trunc(arg.value)));
                data.push(chunk);
                break;
            }
            case 's':
            case 'S':
                data.push(encodeString(arg.value));
                break;
            case 'm':
                data.push(Buffer.concat([arg.value, Buffer.alloc(4)]).subarray(0, 4));
                break;
            case 'b': {
                const size = Buffer.alloc(4);
                size.writeInt32BE(arg.value.length);
                data.push(size, arg.value, Buffer.alloc(pad4(arg.value.length) - arg.value.length));
                break;
            }
            default:
                break;
        }
    }

    chunks.push(encodeString(tags), ...data);
    return Buffer.concat(chunks);
}

/** Infers OSC arguments from JSON values: integers -> i, other numbers -> f, booleans -> T/F. */
export function argsFromValues(values: unknown[]): OscArg[] {
    return values.map((value): OscArg => {
        if (typeof value === 'boolean') {
            return value ? { type: 'T', value: true } : { type: 'F', value: false };
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            return Number.isInteger(value) ? { type: 'i', value } : { type: 'f', value };
        }
        if (value === null || value === undefined) {
            return { type: 'N', value: null };
        }
        return { type: 's', value: String(value) };
    });
}

/** Rebuilds wire arguments from the panel's typed previews (test sends from the composer). */
export function argsFromPreviews(previews: OscArgPreview[]): OscArg[] {
    return previews.slice(0, 16).map((preview): OscArg => {
        const value = preview?.value;
        switch (preview?.type) {
            case 'i':
                return { type: 'i', value: Math.trunc(Number(value) || 0) };
            case 'f':
                return { type: 'f', value: Number(value) || 0 };
            case 'd':
                return { type: 'd', value: Number(value) || 0 };
            case 'T':
                return { type: 'T', value: true };
            case 'F':
                return { type: 'F', value: false };
            case 'N':
                return { type: 'N', value: null };
            case 'I':
                return { type: 'I', value: null };
            default:
                return { type: 's', value: String(value ?? '').slice(0, 512) };
        }
    });
}

export function previewArgs(args: OscArg[]): OscArgPreview[] {
    return args.slice(0, 8).map((arg): OscArgPreview => {
        const value = arg.value;
        if (Buffer.isBuffer(value)) {
            return { type: arg.type, value: `${value.length} bytes` };
        }
        if (typeof value === 'string') {
            return { type: arg.type, value: value.slice(0, 160) };
        }
        if (typeof value === 'number') {
            return {
                type: arg.type,
                value: arg.type === 'f' ? Math.round(value * 10000) / 10000 : value,
            };
        }
        return { type: arg.type, value };
    });
}

function readString(buffer: Buffer, offset: number) {
    const end = buffer.indexOf(0, offset);
    if (end < 0) {
        throw new OscDecodeError('Unterminated OSC string.');
    }
    return {
        value: buffer.toString('utf8', offset, end),
        next: offset + pad4(end - offset + 1),
    };
}

function encodeString(value: string): Buffer {
    const bytes = Buffer.from(value, 'utf8');
    const padded = Buffer.alloc(pad4(bytes.length + 1));
    bytes.copy(padded);
    return padded;
}

function ensure(buffer: Buffer, offset: number, size: number) {
    if (offset + size > buffer.length) {
        throw new OscDecodeError('Truncated OSC argument.');
    }
}

function pad4(size: number): number {
    return (size + 3) & ~3;
}

function clampInt32(value: number): number {
    return Math.max(-2147483648, Math.min(2147483647, Math.trunc(value)));
}

const PATTERN_CHARS = /[*?[{]/;
const MAX_CACHED_PATTERNS = 256;
const patternCache = new Map<string, RegExp | null>();

export function isLiteralOscAddress(address: string): boolean {
    return !PATTERN_CHARS.test(address);
}

/** OSC 1.0 address pattern matching: `*`, `?`, `[a-z]`, `[!abc]` and `{foo,bar}`. */
export function matchesOscAddress(pattern: string, address: string): boolean {
    if (isLiteralOscAddress(pattern)) {
        return pattern === address;
    }

    let regex = patternCache.get(pattern);
    if (regex === undefined) {
        regex = compileAddressPattern(pattern);
        if (patternCache.size >= MAX_CACHED_PATTERNS) {
            patternCache.clear();
        }
        patternCache.set(pattern, regex);
    }

    return regex ? regex.test(address) : false;
}

function compileAddressPattern(pattern: string): RegExp | null {
    let source = '^';
    for (let index = 0; index < pattern.length; index += 1) {
        const char = pattern[index];
        if (char === '*') {
            source += '[^/]*';
        } else if (char === '?') {
            source += '[^/]';
        } else if (char === '[') {
            const end = pattern.indexOf(']', index);
            if (end < 0) return null;
            let body = pattern.slice(index + 1, end);
            const negate = body.startsWith('!');
            if (negate) body = body.slice(1);
            source += `[${negate ? '^' : ''}${body.replace(/[\\\]^]/g, '\\$&')}]`;
            index = end;
        } else if (char === '{') {
            const end = pattern.indexOf('}', index);
            if (end < 0) return null;
            source += `(?:${pattern
                .slice(index + 1, end)
                .split(',')
                .map(escapeRegex)
                .join('|')})`;
            index = end;
        } else {
            source += escapeRegex(char);
        }
    }

    try {
        return new RegExp(`${source}$`);
    } catch {
        return null;
    }
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}
