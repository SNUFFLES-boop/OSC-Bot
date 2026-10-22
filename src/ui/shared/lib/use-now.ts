import { useEffect, useState } from 'react';

/** Re-renders on an interval with the current time; pauses while the page is hidden. */
export function useNow(intervalMs: number, enabled = true): Date {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        if (!enabled) return;
        const tick = () => {
            if (document.visibilityState === 'visible') setNow(new Date());
        };
        const timer = window.setInterval(tick, intervalMs);
        return () => window.clearInterval(timer);
    }, [enabled, intervalMs]);

    return now;
}
