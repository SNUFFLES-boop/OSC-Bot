import WebSocket from 'ws';

import { EProviderState, type ProviderStatus } from '../../shared/protocol';

const STALE_MS = 15000;
const MAX_BACKOFF_MS = 60000;

export type HeartRateProvider = ReturnType<typeof createHeartRateProvider>;

/**
 * Heart rate from Pulsoid's realtime socket, or pushed in over OSC by another app or a
 * sensor bridge (`report`). A reading older than 15 s counts as no reading.
 */
export function createHeartRateProvider({
    onChange,
    connect = (url: string) => new WebSocket(url),
}: {
    onChange: () => void;
    connect?: (url: string) => WebSocket;
}) {
    let socket: WebSocket | null = null;
    let token = '';
    let running = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 2000;
    let bpm: number | null = null;
    let status: ProviderStatus = { state: EProviderState.Off, detail: null };

    function setStatus(state: EProviderState, detail: string | null = null) {
        status = { state, detail };
        onChange();
    }

    function report(value: number) {
        if (!Number.isFinite(value) || value <= 0 || value > 300) return;
        const rounded = Math.round(value);
        const changed = rounded !== bpm;
        bpm = rounded;
        if (status.state !== EProviderState.Ok) status = { state: EProviderState.Ok, detail: null };
        if (staleTimer) clearTimeout(staleTimer);
        staleTimer = setTimeout(() => {
            bpm = null;
            onChange();
        }, STALE_MS);
        staleTimer.unref?.();
        if (changed) onChange();
    }

    function open() {
        if (!running || !token) return;
        setStatus(EProviderState.Starting);
        const ws = connect(`wss://dev.pulsoid.net/api/v1/data/real_time?access_token=${encodeURIComponent(token)}`);
        socket = ws;
        ws.on('open', () => {
            backoff = 2000;
            setStatus(EProviderState.Ok, 'Connected to Pulsoid');
        });
        ws.on('message', (raw) => {
            try {
                const data = JSON.parse(String(raw));
                report(Number(data?.data?.heart_rate));
            } catch {}
        });
        ws.on('unexpected-response', (_request, response) => {
            setStatus(
                EProviderState.Error,
                response.statusCode === 401 || response.statusCode === 403
                    ? 'Pulsoid rejected the token.'
                    : `Pulsoid answered ${response.statusCode}.`,
            );
        });
        ws.on('error', (error) => {
            if (status.state !== EProviderState.Error) setStatus(EProviderState.Error, error.message);
        });
        ws.on('close', () => {
            if (socket !== ws) return;
            socket = null;
            if (!running) return;
            retryTimer = setTimeout(open, backoff);
            retryTimer.unref?.();
            backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        });
    }

    function close() {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
        const ws = socket;
        socket = null;
        try {
            ws?.close();
        } catch {}
    }

    return {
        /** Pulsoid mode: pass the token. OSC mode: pass '' and feed readings with `report`. */
        start(pulsoidToken: string) {
            if (running && pulsoidToken === token) return;
            close();
            running = true;
            token = pulsoidToken;
            if (token) open();
            else setStatus(EProviderState.Starting, 'Waiting for heart rate over OSC');
        },
        stop() {
            running = false;
            token = '';
            close();
            if (staleTimer) clearTimeout(staleTimer);
            bpm = null;
            setStatus(EProviderState.Off);
        },
        report,
        get bpm() {
            return bpm;
        },
        get status() {
            return status;
        },
    };
}
