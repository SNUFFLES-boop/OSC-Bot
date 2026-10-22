import { loadJson, saveJson } from '@/shared/lib/storage';

// Per-device look and layout. Applied to <html> as data attributes and CSS variables (see
// styles.css), so no component needs to know about them. Stored values: keep right-hand sides.

export enum ETheme {
    Midnight = 'midnight',
    Oled = 'oled',
    Nebula = 'nebula',
    Slate = 'slate',
    Sakura = 'sakura',
}

export enum EDensity {
    Compact = 'compact',
    Cozy = 'cozy',
    Roomy = 'roomy',
}

export enum ELayout {
    /** One section at a time with a navigation rail (desktop) or tab bar (phone). */
    Tabs = 'tabs',
    /** Every section as a card on one board, in columns, reorderable and hideable. */
    Board = 'board',
}

export enum ESection {
    Dashboard = 'dashboard',
    Chatbox = 'chatbox',
    Sources = 'sources',
    Avatar = 'avatar',
    Bindings = 'bindings',
    Network = 'network',
    Monitor = 'monitor',
    Settings = 'settings',
}

export const ALL_SECTIONS = Object.values(ESection);

export type Preferences = {
    theme: ETheme;
    accent: string;
    density: EDensity;
    scale: number;
    glow: number;
    reduceMotion: boolean;
    layout: ELayout;
    tab: ESection;
    order: ESection[];
    hidden: ESection[];
    collapsed: ESection[];
};

export const ACCENTS = ['#00ffd5', '#3b82f6', '#a78bfa', '#ff2e63', '#7cff5b', '#ffb12e', '#ee00ff', '#f472b6'];
export const UI_SCALES = [0.9, 1, 1.1, 1.2];

export const DEFAULT_PREFERENCES: Preferences = {
    theme: ETheme.Midnight,
    accent: ACCENTS[0],
    density: EDensity.Cozy,
    scale: 1,
    glow: 1,
    reduceMotion: false,
    layout: ELayout.Tabs,
    tab: ESection.Dashboard,
    order: [...ALL_SECTIONS],
    hidden: [],
    collapsed: [],
};

const KEY = 'osc-bot.preferences.v1';

export function loadPreferences(): Preferences {
    return loadJson(KEY, revive, DEFAULT_PREFERENCES);
}

export function savePreferences(prefs: Preferences): Preferences {
    applyPreferences(prefs);
    saveJson(KEY, prefs, () => JSON.stringify(prefs) === JSON.stringify(DEFAULT_PREFERENCES));
    return prefs;
}

export function applyPreferences(prefs: Preferences): void {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.density = prefs.density;
    root.dataset.motion = prefs.reduceMotion ? 'reduced' : 'full';
    root.style.setProperty('--deck-accent', prefs.accent);
    root.style.setProperty('--deck-zoom', String(prefs.scale));
    root.style.setProperty('--deck-glow', String(prefs.glow));
}

export function moveSection(prefs: Preferences, section: ESection, direction: -1 | 1): Preferences {
    const order = [...prefs.order];
    const index = order.indexOf(section);
    const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= order.length) return prefs;
    [order[index], order[swap]] = [order[swap], order[index]];
    return { ...prefs, order };
}

export function toggleFlag(prefs: Preferences, flag: 'hidden' | 'collapsed', section: ESection): Preferences {
    const list = prefs[flag];
    return {
        ...prefs,
        [flag]: list.includes(section) ? list.filter((entry) => entry !== section) : [...list, section],
    };
}

function revive(raw: unknown): Preferences | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const value = raw as Record<string, unknown>;
    const pick = <T extends string>(options: Record<string, T>, candidate: unknown, fallback: T): T =>
        Object.values(options).includes(candidate as T) ? (candidate as T) : fallback;
    const number = (candidate: unknown, min: number, max: number, fallback: number) =>
        typeof candidate === 'number' && Number.isFinite(candidate) ? Math.min(max, Math.max(min, candidate)) : fallback;
    const sections = (candidate: unknown) =>
        Array.isArray(candidate) ? ALL_SECTIONS.filter((section) => candidate.includes(section)) : [];
    const order = Array.isArray(value.order) ? (value.order.filter((entry) => ALL_SECTIONS.includes(entry as ESection)) as ESection[]) : [];
    // Sections added later are appended so a stored layout never hides them.
    for (const section of ALL_SECTIONS) if (!order.includes(section)) order.push(section);

    return {
        theme: pick(ETheme, value.theme, DEFAULT_PREFERENCES.theme),
        accent:
            typeof value.accent === 'string' && /^#[0-9a-f]{6}$/i.test(value.accent)
                ? value.accent.toLowerCase()
                : DEFAULT_PREFERENCES.accent,
        density: pick(EDensity, value.density, DEFAULT_PREFERENCES.density),
        scale: number(value.scale, 0.85, 1.25, DEFAULT_PREFERENCES.scale),
        glow: number(value.glow, 0, 1, DEFAULT_PREFERENCES.glow),
        reduceMotion: typeof value.reduceMotion === 'boolean' ? value.reduceMotion : false,
        layout: pick(ELayout, value.layout, DEFAULT_PREFERENCES.layout),
        tab: pick(ESection, value.tab, DEFAULT_PREFERENCES.tab),
        order: [...new Set(order)],
        hidden: sections(value.hidden).filter((section) => section !== ESection.Settings),
        collapsed: sections(value.collapsed),
    };
}
