import { useCallback, useEffect, useReducer, useRef } from 'react';

import { type BotConfig, normalizeConfig } from '../../shared/config';
import {
    type ActivityEntry,
    type BotStatus,
    type ClientMessage,
    type Command,
    type HostInfo,
    type LiveState,
    PROTOCOL_VERSION,
    type ServerMessage,
    WS_PATH,
} from '../../shared/protocol';

export enum EConnection {
    Connecting = 'connecting',
    Online = 'online',
    Offline = 'offline',
}

export type Notice = { id: number; ok: boolean; text: string };

export type AppState = {
    connection: EConnection;
    config: BotConfig | null;
    status: BotStatus | null;
    live: LiveState | null;
    host: HostInfo | null;
    activity: ActivityEntry[];
    /** Local edits not yet sent; incoming configs must not clobber what the user is typing. */
    draftPending: boolean;
    awaitingRequestId: string | null;
    notice: Notice | null;
};

type Action =
    | { type: 'connection'; connection: EConnection }
    | { type: 'message'; message: ServerMessage }
    | { type: 'edited'; config: BotConfig }
    | { type: 'sent'; requestId: string }
    | { type: 'notice'; ok: boolean; text: string };

const ACTIVITY_LIMIT = 400;
const CONFIG_DEBOUNCE_MS = 350;
const RECONNECT_MAX_MS = 15000;

const initialState: AppState = {
    connection: EConnection.Connecting,
    config: null,
    status: null,
    live: null,
    host: null,
    activity: [],
    draftPending: false,
    awaitingRequestId: null,
    notice: null,
};

export function reducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case 'connection':
            return action.connection === EConnection.Online
                ? { ...state, connection: action.connection }
                : { ...state, connection: action.connection, draftPending: false, awaitingRequestId: null };
        case 'edited':
            return { ...state, config: action.config, draftPending: true };
        case 'sent':
            return { ...state, draftPending: false, awaitingRequestId: action.requestId };
        case 'notice':
            return { ...state, notice: { id: (state.notice?.id ?? 0) + 1, ok: action.ok, text: action.text } };
        case 'message':
            return applyMessage(state, action.message);
    }
}

function applyMessage(state: AppState, message: ServerMessage): AppState {
    switch (message.type) {
        case 'state': {
            const keepLocal = state.draftPending || (state.awaitingRequestId !== null && message.requestId !== state.awaitingRequestId);
            return {
                ...state,
                config: keepLocal && state.config ? state.config : normalizeConfig(message.payload.config),
                awaitingRequestId: keepLocal ? state.awaitingRequestId : null,
                status: message.payload.status,
                live: message.payload.live,
                host: message.payload.host,
                activity: mergeActivity([], message.payload.activity),
            };
        }
        case 'tick':
            return { ...state, status: message.payload.status, live: message.payload.live };
        case 'activity':
            return { ...state, activity: mergeActivity(state.activity, message.payload.entries) };
        case 'result':
            return message.payload.ok && message.payload.action !== 'chatbox_send' && message.payload.action !== 'send_osc'
                ? state
                : {
                      ...state,
                      notice: {
                          id: (state.notice?.id ?? 0) + 1,
                          ok: message.payload.ok,
                          text: message.payload.message ?? (message.payload.ok ? 'Sent' : 'That did not work'),
                      },
                  };
        default:
            return state;
    }
}

/** Entries are upserted by id: the engine re-sends an entry when it folds a repeat into it. */
export function mergeActivity(current: ActivityEntry[], incoming: ActivityEntry[]): ActivityEntry[] {
    if (incoming.length === 0) return current;
    const byId = new Map(current.map((entry) => [entry.id, entry]));
    for (const entry of incoming) byId.set(entry.id, entry);
    return Array.from(byId.values())
        .sort((left, right) => left.id - right.id)
        .slice(-ACTIVITY_LIMIT);
}

let sequence = 0;
const requestId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${++sequence}`;

function socketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${protocol}://${window.location.host}${WS_PATH}`;
}

export function useConnection() {
    const [state, dispatch] = useReducer(reducer, initialState);
    const socketRef = useRef<WebSocket | null>(null);
    const pendingConfig = useRef<BotConfig | null>(null);
    const configTimer = useRef<number | null>(null);
    const configRef = useRef<BotConfig | null>(null);
    configRef.current = state.config;

    useEffect(() => {
        let disposed = false;
        let attempt = 0;
        let retry: number | null = null;

        const open = () => {
            if (disposed) return;
            dispatch({ type: 'connection', connection: EConnection.Connecting });
            const socket = new WebSocket(socketUrl());
            socketRef.current = socket;
            socket.addEventListener('open', () => {
                attempt = 0;
                dispatch({ type: 'connection', connection: EConnection.Online });
                send(socket, { type: 'hello', version: PROTOCOL_VERSION });
            });
            socket.addEventListener('message', (event) => {
                try {
                    dispatch({ type: 'message', message: JSON.parse(String(event.data)) });
                } catch {}
            });
            socket.addEventListener('close', () => {
                if (socketRef.current === socket) socketRef.current = null;
                if (disposed) return;
                dispatch({ type: 'connection', connection: EConnection.Offline });
                retry = window.setTimeout(open, Math.min(1000 * 2 ** attempt++, RECONNECT_MAX_MS));
            });
        };

        open();
        return () => {
            disposed = true;
            if (retry !== null) window.clearTimeout(retry);
            socketRef.current?.close();
        };
    }, []);

    const flush = useCallback(() => {
        if (configTimer.current !== null) window.clearTimeout(configTimer.current);
        configTimer.current = null;
        const config = pendingConfig.current;
        pendingConfig.current = null;
        const socket = socketRef.current;
        if (!config) return;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            dispatch({ type: 'notice', ok: false, text: 'Not connected: the change was not saved.' });
            return;
        }
        const id = requestId('config');
        send(socket, { type: 'config', requestId: id, payload: { config } });
        dispatch({ type: 'sent', requestId: id });
    }, []);

    /** Applies an edit at once and syncs it (debounced while typing, immediate for toggles). */
    const update = useCallback(
        (change: (config: BotConfig) => BotConfig, immediate = false) => {
            const current = configRef.current;
            if (!current) return;
            const next = change(current);
            configRef.current = next;
            pendingConfig.current = next;
            dispatch({ type: 'edited', config: next });
            if (immediate) {
                flush();
                return;
            }
            if (configTimer.current !== null) window.clearTimeout(configTimer.current);
            configTimer.current = window.setTimeout(flush, CONFIG_DEBOUNCE_MS);
        },
        [flush],
    );

    const command = useCallback((payload: Command) => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            dispatch({ type: 'notice', ok: false, text: 'Not connected to the bot.' });
            return false;
        }
        send(socket, { type: 'command', requestId: requestId(payload.action), payload });
        return true;
    }, []);

    const notify = useCallback((ok: boolean, text: string) => dispatch({ type: 'notice', ok, text }), []);

    return { state, update, command, notify };
}

export type Connection = ReturnType<typeof useConnection>;
export type UpdateConfig = Connection['update'];
export type SendCommand = Connection['command'];

function send(socket: WebSocket, message: ClientMessage) {
    socket.send(JSON.stringify(message));
}
