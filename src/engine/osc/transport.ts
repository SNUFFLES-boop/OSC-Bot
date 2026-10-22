import dgram from 'node:dgram';

import type { Relay } from '../../shared/config';
import { EOscState } from '../../shared/protocol';
import { decodePacket, encodeMessage, matchesOscAddress, type OscArg, type OscMessage } from './codec';

export type Peer = { address: string; port: number };

/** The slice of `dgram.Socket` the transport uses; injectable so tests run without UDP. */
export type UdpSocket = {
    on(event: 'message', listener: (message: Buffer, peer: Peer) => void): unknown;
    on(event: 'listening', listener: () => void): unknown;
    on(event: 'error', listener: (error: Error) => void): unknown;
    bind(port: number, address: string): unknown;
    send(message: Buffer, port: number, address: string, callback: (error: Error | null) => void): void;
    close(): void;
    unref?(): unknown;
};

export type TransportOptions = {
    port: number;
    lan: boolean;
    relays: Relay[];
    createSocket?: () => UdpSocket;
    onMessage: (message: OscMessage, peer: Peer) => void;
    onPacket: (direction: 'in' | 'out') => void;
    onDecodeError: (error: Error, peer: Peer) => void;
    onSendError: (error: Error, target: string) => void;
    onState: (state: EOscState, detail: string | null) => void;
};

const MAX_MESSAGES_PER_PACKET = 64;

/**
 * One listen socket and one send socket. Sending never depends on listening: when another
 * OSC app owns the port, the chatbox and avatar sync keep working ("send only").
 */
export function createTransport(options: TransportOptions) {
    const createSocket = options.createSocket ?? (() => dgram.createSocket({ type: 'udp4' }) as unknown as UdpSocket);
    const host = options.lan ? '0.0.0.0' : '127.0.0.1';
    let relays = options.relays;
    let closed = false;

    const sender = createSocket();
    sender.on('error', (error) => options.onSendError(error, 'send socket'));
    sender.unref?.();

    let listener: UdpSocket | null = createSocket();
    let listening = false;
    listener.on('listening', () => {
        listening = true;
        options.onState(EOscState.Listening, `${host}:${options.port}`);
    });
    listener.on('message', (packet, peer) => handlePacket(packet, peer));
    listener.on('error', (error: Error & { code?: string }) => {
        if (listening) {
            options.onSendError(error, 'listen socket');
            return;
        }
        listener?.close();
        listener = null;
        options.onState(
            EOscState.SendOnly,
            error.code === 'EADDRINUSE'
                ? `Port ${options.port} is used by another OSC app. Sending still works; add a relay in that app or pick another port.`
                : error.code === 'EACCES'
                  ? `Windows refused port ${options.port}. Pick another listen port.`
                  : error.message,
        );
    });
    listener.unref?.();
    options.onState(EOscState.Starting, null);
    try {
        listener.bind(options.port, host);
    } catch (error) {
        options.onState(EOscState.Error, error instanceof Error ? error.message : String(error));
    }

    function handlePacket(packet: Buffer, peer: Peer) {
        if (closed) return;
        options.onPacket('in');
        let messages: OscMessage[];
        try {
            messages = decodePacket(packet).slice(0, MAX_MESSAGES_PER_PACKET);
        } catch (error) {
            options.onDecodeError(error instanceof Error ? error : new Error(String(error)), peer);
            return;
        }

        // Relays receive the original bytes so other OSC apps see exactly what VRChat sent.
        for (const relay of relays) {
            if (!relay.enabled) continue;
            if (relay.pattern && !messages.some((message) => matchesOscAddress(relay.pattern, message.address))) {
                continue;
            }
            sendRaw(packet, relay.host, relay.port);
        }

        for (const message of messages) {
            options.onMessage(message, peer);
        }
    }

    function sendRaw(packet: Buffer, targetHost: string, port: number) {
        if (closed) return;
        try {
            sender.send(packet, port, targetHost, (error) => {
                if (error) options.onSendError(error, `${targetHost}:${port}`);
            });
            options.onPacket('out');
        } catch (error) {
            options.onSendError(error instanceof Error ? error : new Error(String(error)), `${targetHost}:${port}`);
        }
    }

    return {
        send(targetHost: string, port: number, address: string, args: OscArg[]) {
            sendRaw(encodeMessage(address, args), targetHost, port);
        },
        /** Replies through the listen socket, so clients that read their own port receive them. */
        reply(peer: Peer, address: string, args: OscArg[]) {
            const socket = listener;
            if (!socket || closed) return;
            socket.send(encodeMessage(address, args), peer.port, peer.address, (error) => {
                if (error) options.onSendError(error, `${peer.address}:${peer.port}`);
            });
            options.onPacket('out');
        },
        setRelays(next: Relay[]) {
            relays = next;
        },
        close() {
            closed = true;
            for (const socket of [listener, sender]) {
                try {
                    socket?.close();
                } catch {}
            }
            listener = null;
        },
    };
}

export type Transport = ReturnType<typeof createTransport>;
