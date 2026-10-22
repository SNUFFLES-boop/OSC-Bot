import type { ReactNode } from 'react';

import { LIMITS } from '../../../shared/config';
import type { TrafficSample as OscTrafficSample } from '../../../shared/protocol';

const OSC_LIMITS = LIMITS;

const WIDTH = OSC_LIMITS.historySeconds - 1;
const HEIGHT = 26;

/** Packets per second over the last minute: inbound in the accent color, outbound in violet. */
export const TrafficSparkline = ({
    history,
    action,
}: {
    history: OscTrafficSample[];
    /** Rendered in the caption, e.g. a reset control. */
    action?: ReactNode;
}) => {
    const samples = padHistory(history);
    const peak = Math.max(1, ...samples.map((sample) => Math.max(sample.in, sample.out)));
    const latest = samples[samples.length - 1];
    const inLine = toPath(
        samples.map((sample) => sample.in),
        peak,
    );
    const outLine = toPath(
        samples.map((sample) => sample.out),
        peak,
    );

    return (
        <figure className="rounded-[12px] border border-white/8 bg-black/25 px-2.5 pb-1.5 pt-2">
            <svg
                role="img"
                aria-label={`Traffic over the last minute: ${latest.in} in and ${latest.out} out per second`}
                className="h-11 w-full overflow-visible"
                preserveAspectRatio="none"
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            >
                <defs>
                    <linearGradient id="osc-in-fill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--deck-accent)" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="var(--deck-accent)" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={`${inLine} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`} fill="url(#osc-in-fill)" />
                <path
                    d={outLine}
                    fill="none"
                    stroke="#a78bfa"
                    strokeOpacity="0.85"
                    strokeWidth="1.4"
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                />
                <path
                    d={inLine}
                    fill="none"
                    stroke="var(--deck-accent)"
                    strokeWidth="1.6"
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                />
            </svg>
            <figcaption className="mt-1 flex items-center justify-between font-mono text-[9.5px] text-(--deck-fg-4)">
                <span className="flex items-center gap-2">
                    -60s
                    {action}
                </span>
                <span className="flex items-center gap-2.5">
                    <span className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-(--deck-accent)" />
                        {latest.in}/s
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-violet-400" />
                        {latest.out}/s
                    </span>
                    <span>peak {peak}/s</span>
                </span>
            </figcaption>
        </figure>
    );
};

function padHistory(history: OscTrafficSample[]): OscTrafficSample[] {
    const recent = history.slice(-OSC_LIMITS.historySeconds);
    const padding = Array.from({ length: OSC_LIMITS.historySeconds - recent.length }, () => ({
        in: 0,
        out: 0,
    }));
    return [...padding, ...recent];
}

function toPath(values: number[], peak: number): string {
    return values
        .map((value, index) => {
            const y = HEIGHT - 1 - (value / peak) * (HEIGHT - 3);
            return `${index === 0 ? 'M' : 'L'}${index},${y.toFixed(2)}`;
        })
        .join(' ');
}
