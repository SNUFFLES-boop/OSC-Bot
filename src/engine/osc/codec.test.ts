// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { argsFromPreviews, decodePacket, encodeMessage, matchesOscAddress, OscDecodeError, previewArgs } from './codec';

describe('osc codec', () => {
    it('round-trips every encodable type', () => {
        const packet = encodeMessage('/avatar/parameters/Speed', [
            { type: 'i', value: -42 },
            { type: 'f', value: 0.5 },
            { type: 's', value: 'héllo' },
            { type: 'T', value: true },
            { type: 'F', value: false },
            { type: 'N', value: null },
            { type: 'd', value: 1.25 },
            { type: 'b', value: Buffer.from([1, 2, 3]) },
        ]);

        expect(packet.length % 4).toBe(0);
        const [message] = decodePacket(packet);
        expect(message.address).toBe('/avatar/parameters/Speed');
        expect(previewArgs(message.args)).toEqual([
            { type: 'i', value: -42 },
            { type: 'f', value: 0.5 },
            { type: 's', value: 'héllo' },
            { type: 'T', value: true },
            { type: 'F', value: false },
            { type: 'N', value: null },
            { type: 'd', value: 1.25 },
            { type: 'b', value: '3 bytes' },
        ]);
    });

    it('matches the VRChat chatbox wire format byte for byte', () => {
        const packet = encodeMessage('/chatbox/input', [
            { type: 's', value: 'hi' },
            { type: 'T', value: true },
            { type: 'F', value: false },
        ]);
        expect(packet.toString('latin1')).toBe('/chatbox/input\0\0,sTF\0\0\0\0hi\0\0');
    });

    it('flattens nested bundles', () => {
        const inner = encodeMessage('/a', [{ type: 'i', value: 1 }]);
        const second = encodeMessage('/b', []);
        const bundle = (elements: Buffer[]) =>
            Buffer.concat([
                Buffer.from('#bundle\0', 'latin1'),
                Buffer.alloc(8),
                ...elements.flatMap((element) => {
                    const size = Buffer.alloc(4);
                    size.writeInt32BE(element.length);
                    return [size, element];
                }),
            ]);

        const messages = decodePacket(bundle([inner, bundle([second])]));
        expect(messages.map((message) => message.address)).toEqual(['/a', '/b']);
    });

    it('treats a bare address as an impulse and rejects garbage', () => {
        expect(decodePacket(Buffer.from('/ping\0\0\0', 'latin1'))).toEqual([{ address: '/ping', args: [] }]);
        expect(() => decodePacket(Buffer.from('nope', 'latin1'))).toThrow(OscDecodeError);
        expect(() => decodePacket(Buffer.from('/a\0\0,i\0\0', 'latin1'))).toThrow(OscDecodeError);
        expect(() => decodePacket(Buffer.alloc(3))).toThrow(OscDecodeError);
    });

    it('rebuilds typed arguments from panel previews', () => {
        expect(
            argsFromPreviews([
                { type: 'i', value: '7.9' },
                { type: 'f', value: 0.25 },
                { type: 'T', value: true },
                { type: 's', value: 12 },
            ]),
        ).toEqual([
            { type: 'i', value: 7 },
            { type: 'f', value: 0.25 },
            { type: 'T', value: true },
            { type: 's', value: '12' },
        ]);
    });

    it('supports OSC address patterns', () => {
        expect(matchesOscAddress('/avatar/parameters/God', '/avatar/parameters/God')).toBe(true);
        expect(matchesOscAddress('/avatar/parameters/*', '/avatar/parameters/God')).toBe(true);
        expect(matchesOscAddress('/avatar/*', '/avatar/parameters/God')).toBe(false);
        expect(matchesOscAddress('/fader?', '/fader3')).toBe(true);
        expect(matchesOscAddress('/fader[1-3]', '/fader4')).toBe(false);
        expect(matchesOscAddress('/fader[!1-3]', '/fader4')).toBe(true);
        expect(matchesOscAddress('/btn/{on,off}', '/btn/off')).toBe(true);
        expect(matchesOscAddress('/a.b', '/aXb')).toBe(false);
        expect(matchesOscAddress('/broken[', '/broken[')).toBe(false);
    });
});
