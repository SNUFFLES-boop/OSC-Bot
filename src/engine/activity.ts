import { LIMITS } from '../shared/config';
import type { ActivityEntry, EDirection, TrafficSample } from '../shared/protocol';
import { type OscArg, previewArgs } from './osc/codec';

const LIMITS_ACTIVITY = Object.freeze({
    size: 400,
    snapshot: 150,
    flushMs: 200,
    foldWindowMs: 1500,
    foldLookback: 24,
    historySeconds: LIMITS.historySeconds,
});

export type ActivityInput = {
    direction: EDirection;
    address: string;
    args?: OscArg[];
    peer?: string;
    note?: string | null;
    failed?: boolean;
    bindingId?: string | null;
};

/**
 * Bounded activity log plus traffic stats. Repeats of the same message within a short
 * window are folded into one entry (`count`), which is what keeps VRChat's 10+ Hz parameter
 * stream readable and cheap to forward to the UI.
 */
export function createActivityLog(publish: (entries: ActivityEntry[]) => void) {
    const entries: ActivityEntry[] = [];
    const pending = new Map<number, ActivityEntry>();
    let nextId = 1;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let packetsIn = 0;
    let packetsOut = 0;
    let errors = 0;
    let history: TrafficSample[] = [];
    let bucket: TrafficSample = { in: 0, out: 0 };

    function record(input: ActivityInput) {
        const now = Date.now();
        const args = previewArgs(input.args ?? []);
        const peer = input.peer ?? '';
        const note = input.note ?? null;
        for (let index = entries.length - 1; index >= Math.max(0, entries.length - LIMITS_ACTIVITY.foldLookback); index -= 1) {
            const entry = entries[index];
            if (
                entry.direction === input.direction &&
                entry.address === input.address &&
                entry.peer === peer &&
                entry.note === note &&
                now - entry.at < LIMITS_ACTIVITY.foldWindowMs
            ) {
                entry.args = args;
                entry.at = now;
                entry.count += 1;
                queue(entry);
                return;
            }
        }

        const entry: ActivityEntry = {
            id: nextId++,
            at: now,
            direction: input.direction,
            address: input.address,
            args,
            peer,
            count: 1,
            note,
            failed: input.failed || undefined,
            bindingId: input.bindingId ?? null,
        };
        entries.push(entry);
        if (entries.length > LIMITS_ACTIVITY.size) entries.splice(0, entries.length - LIMITS_ACTIVITY.size);
        queue(entry);
    }

    function queue(entry: ActivityEntry) {
        pending.set(entry.id, entry);
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
            flushTimer = null;
            const batch = Array.from(pending.values(), (item) => ({ ...item }));
            pending.clear();
            if (batch.length) publish(batch);
        }, LIMITS_ACTIVITY.flushMs);
        flushTimer.unref?.();
    }

    return {
        record,
        packet(direction: 'in' | 'out') {
            if (direction === 'in') {
                packetsIn += 1;
                bucket.in += 1;
            } else {
                packetsOut += 1;
                bucket.out += 1;
            }
        },
        error() {
            errors += 1;
        },
        /** Called once per second. */
        tick() {
            history.push(bucket);
            if (history.length > LIMITS_ACTIVITY.historySeconds) history = history.slice(-LIMITS_ACTIVITY.historySeconds);
            bucket = { in: 0, out: 0 };
        },
        reset() {
            packetsIn = packetsOut = errors = 0;
            history = [];
            bucket = { in: 0, out: 0 };
            entries.length = 0;
        },
        snapshot() {
            return entries.slice(-LIMITS_ACTIVITY.snapshot).map((entry) => ({ ...entry }));
        },
        get counters() {
            return { packetsIn, packetsOut, errors, history: history.slice() };
        },
        close() {
            if (flushTimer) clearTimeout(flushTimer);
            flushTimer = null;
            pending.clear();
        },
    };
}

export type ActivityLog = ReturnType<typeof createActivityLog>;
