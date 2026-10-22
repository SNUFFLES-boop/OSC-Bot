import { type ReactNode, useEffect, useRef, useState } from 'react';

import { cn } from '@/shared/lib/ui';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { IconButton } from '@/shared/ui/IconButton';
import { Panel } from '@/shared/ui/Panel';
import { EOscState } from '../../shared/protocol';
import { AvatarSection } from '../features/avatar/AvatarSection';
import { BindingsSection } from '../features/bindings/BindingsSection';
import { ChatboxSection } from '../features/chatbox/ChatboxSection';
import { Dashboard } from '../features/dashboard/Dashboard';
import { MonitorSection } from '../features/monitor/MonitorSection';
import { NetworkSection } from '../features/network/NetworkSection';
import { SettingsSection } from '../features/settings/SettingsSection';
import { SourcesSection } from '../features/sources/SourcesSection';
import { type AppState, EConnection, type Notice, useConnection } from './connection';
import { ELayout, ESection, loadPreferences, moveSection, type Preferences, savePreferences, toggleFlag } from './preferences';
import type { SectionProps } from './section-props';

const SECTIONS: Record<ESection, { title: string; subtitle: string; icon: IconName }> = {
    [ESection.Dashboard]: { title: 'Dashboard', subtitle: 'Live status and quick chat', icon: 'home' },
    [ESection.Chatbox]: { title: 'Chatbox', subtitle: 'Rotating messages above your avatar', icon: 'message' },
    [ESection.Sources]: { title: 'Sources', subtitle: 'Music, PC stats, heart rate, weather, AFK', icon: 'sliders' },
    [ESection.Avatar]: { title: 'Avatar sync', subtitle: 'Live values → avatar parameters', icon: 'user' },
    [ESection.Bindings]: { title: 'Bindings', subtitle: 'Avatar buttons and controllers → actions', icon: 'link' },
    [ESection.Network]: { title: 'Network', subtitle: 'Ports, relays, phone remote, backup', icon: 'network' },
    [ESection.Monitor]: { title: 'Monitor', subtitle: 'Every OSC packet in and out', icon: 'activity' },
    [ESection.Settings]: { title: 'Settings', subtitle: 'Look, layout and app behavior', icon: 'palette' },
};

export const App = () => {
    const { state, update, command, notify } = useConnection();
    const [prefs, setPrefs] = useState(loadPreferences);
    const [customizing, setCustomizing] = useState(false);
    const changePrefs = (next: Preferences) => setPrefs(savePreferences(next));

    const ready = readyProps(state, update, command, notify);
    const board = prefs.layout === ELayout.Board;

    const renderSection = (section: ESection, props: SectionProps): ReactNode => {
        switch (section) {
            case ESection.Dashboard:
                return <Dashboard {...props} />;
            case ESection.Chatbox:
                return <ChatboxSection {...props} />;
            case ESection.Sources:
                return <SourcesSection {...props} />;
            case ESection.Avatar:
                return <AvatarSection {...props} />;
            case ESection.Bindings:
                return <BindingsSection {...props} />;
            case ESection.Network:
                return <NetworkSection {...props} />;
            case ESection.Monitor:
                return <MonitorSection {...props} />;
            case ESection.Settings:
                return <SettingsSection {...props} prefs={prefs} onPrefs={changePrefs} />;
        }
    };

    const guarded = (section: ESection, props: SectionProps) => (
        <ErrorBoundary
            fallback={(retry) => (
                <div className="flex items-center gap-3 rounded-[13px] border border-red-400/25 bg-red-500/8 p-3 text-[12.5px] text-red-100">
                    <Icon className="size-4 shrink-0" name="alert" />
                    <span className="flex-1">This section hit a problem. The bot keeps running.</span>
                    <button type="button" className="rounded-[8px] bg-white/10 px-2.5 py-1 font-semibold" onClick={retry}>
                        Reload
                    </button>
                </div>
            )}
        >
            {renderSection(section, props)}
        </ErrorBoundary>
    );

    const visible = prefs.order.filter((section) => customizing || !prefs.hidden.includes(section));
    const tab = prefs.tab;

    return (
        <div className="relative flex h-svh flex-col overflow-hidden bg-(--deck-bg)">
            <div className="deck-glow pointer-events-none absolute -inset-12 bg-[radial-gradient(circle_at_25%_10%,color-mix(in_oklab,var(--deck-accent)_20%,transparent),transparent_45%),radial-gradient(circle_at_85%_90%,color-mix(in_oklab,var(--deck-accent)_14%,transparent),transparent_45%)]" />
            <div className="deck-theme-tint pointer-events-none absolute inset-0" />

            <Header
                state={state}
                title={board ? 'Board' : SECTIONS[tab].title}
                board={board}
                customizing={customizing}
                onCustomize={() => setCustomizing((value) => !value)}
                onLayout={() => changePrefs({ ...prefs, layout: board ? ELayout.Tabs : ELayout.Board })}
            />

            <div className="relative flex min-h-0 flex-1">
                {!board ? <NavRail active={tab} onSelect={(section) => changePrefs({ ...prefs, tab: section })} /> : null}
                <main
                    data-scroll-root
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-24 pt-3 md:px-6 md:pb-8 [scrollbar-width:thin]"
                >
                    <div className={cn('deck-scale mx-auto w-full', board ? 'max-w-[1700px]' : 'deck-content')}>
                        {!ready ? (
                            <Offline connection={state.connection} />
                        ) : board ? (
                            <>
                                {customizing ? (
                                    <div className="mb-3 flex items-center gap-2 rounded-[13px] border border-dashed border-[color-mix(in_oklab,var(--deck-accent)_45%,transparent)] px-3 py-2 text-[12.5px] text-(--deck-fg-2)">
                                        <Icon className="size-4 text-(--deck-accent)" name="layout" />
                                        <span className="flex-1">Reorder, hide or show cards. Saved on this device.</span>
                                        <button
                                            type="button"
                                            className="rounded-[8px] bg-(--deck-accent) px-3 py-1 text-[12px] font-bold text-black"
                                            onClick={() => setCustomizing(false)}
                                        >
                                            Done
                                        </button>
                                    </div>
                                ) : null}
                                <div className="board-columns">
                                    {visible.map((section, index) => (
                                        <Panel
                                            key={section}
                                            id={section}
                                            title={SECTIONS[section].title}
                                            subtitle={SECTIONS[section].subtitle}
                                            icon={SECTIONS[section].icon}
                                            board={{
                                                collapsed: prefs.collapsed.includes(section),
                                                hidden: prefs.hidden.includes(section),
                                                customizing,
                                                canMoveUp: index > 0,
                                                canMoveDown: index < visible.length - 1,
                                                onToggleCollapsed: () => changePrefs(toggleFlag(prefs, 'collapsed', section)),
                                                onMove: (direction) => changePrefs(moveSection(prefs, section, direction)),
                                                onToggleHidden: () =>
                                                    section !== ESection.Settings && changePrefs(toggleFlag(prefs, 'hidden', section)),
                                            }}
                                        >
                                            {guarded(section, ready)}
                                        </Panel>
                                    ))}
                                </div>
                            </>
                        ) : tab === ESection.Dashboard ? (
                            guarded(tab, ready)
                        ) : (
                            <Panel id={tab} title={SECTIONS[tab].title} subtitle={SECTIONS[tab].subtitle} icon={SECTIONS[tab].icon}>
                                {guarded(tab, ready)}
                            </Panel>
                        )}
                    </div>
                </main>
            </div>

            {!board ? <TabBar active={tab} onSelect={(section) => changePrefs({ ...prefs, tab: section })} /> : null}
            <Toast notice={state.notice} />
        </div>
    );
};

function readyProps(
    state: AppState,
    update: SectionProps['update'],
    command: SectionProps['command'],
    notify: SectionProps['notify'],
): SectionProps | null {
    if (!state.config || !state.status || !state.live || !state.host) return null;
    return {
        config: state.config,
        status: state.status,
        live: state.live,
        host: state.host,
        activity: state.activity,
        update,
        command,
        notify,
    };
}

const Header = ({
    state,
    title,
    board,
    customizing,
    onCustomize,
    onLayout,
}: {
    state: AppState;
    title: string;
    board: boolean;
    customizing: boolean;
    onCustomize: () => void;
    onLayout: () => void;
}) => {
    const online = state.connection === EConnection.Online;
    const osc = state.status?.osc;
    const tone = !online ? 'off' : osc === EOscState.Listening ? 'ok' : 'warn';
    return (
        <header className="remote-glass-header relative z-20 border-b px-3.5 py-2.5 md:px-5">
            <div className="flex items-center gap-3">
                <span className="relative flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-[linear-gradient(140deg,var(--deck-accent),color-mix(in_oklab,var(--deck-accent)_40%,#7c3aed))] text-black shadow-[0_6px_20px_-6px_var(--deck-accent)]">
                    <Icon className="size-5" name="broadcast" stroke={2} />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="font-mono text-[9.5px] font-bold tracking-[0.2em] text-(--deck-fg-4)">OSC BOT</div>
                    <div className="truncate text-[15px] font-semibold text-(--deck-fg)">{title}</div>
                </div>
                {board ? (
                    <IconButton
                        icon="layout"
                        label={customizing ? 'Finish customizing' : 'Customize board'}
                        active={customizing}
                        onClick={onCustomize}
                    />
                ) : null}
                <IconButton icon={board ? 'list' : 'grid'} label={board ? 'Switch to pages' : 'Switch to board'} onClick={onLayout} />
                <span
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.12em]',
                        tone === 'ok' && 'border-[color-mix(in_oklab,var(--deck-accent)_35%,transparent)] text-(--deck-accent)',
                        tone === 'warn' && 'border-amber-300/30 text-amber-300',
                        tone === 'off' && 'border-white/10 text-(--deck-fg-4)',
                    )}
                >
                    <span
                        className={cn(
                            'size-1.5 rounded-full bg-current',
                            tone !== 'off' && 'shadow-[0_0_6px_currentColor] motion-safe:animate-[breathe_1.8s_ease-in-out_infinite]',
                        )}
                    />
                    {!online ? 'OFFLINE' : osc === EOscState.Listening ? 'LIVE' : osc === EOscState.SendOnly ? 'SEND ONLY' : 'STARTING'}
                </span>
            </div>
        </header>
    );
};

const ORDER: ESection[] = [
    ESection.Dashboard,
    ESection.Chatbox,
    ESection.Sources,
    ESection.Avatar,
    ESection.Bindings,
    ESection.Network,
    ESection.Monitor,
    ESection.Settings,
];

const NavRail = ({ active, onSelect }: { active: ESection; onSelect: (section: ESection) => void }) => (
    <nav
        aria-label="Sections"
        className="relative z-10 hidden w-56 shrink-0 flex-col gap-1 border-r border-white/8 bg-black/15 p-3 md:flex"
    >
        {ORDER.map((section) => (
            <button
                key={section}
                type="button"
                aria-current={active === section ? 'page' : undefined}
                className={cn(
                    'group flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-left text-[13px] font-semibold transition-colors',
                    active === section
                        ? 'bg-[color-mix(in_oklab,var(--deck-accent)_14%,transparent)] text-(--deck-fg) shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--deck-accent)_35%,transparent)]'
                        : 'text-(--deck-fg-3) hover:bg-white/5 hover:text-(--deck-fg)',
                )}
                onClick={() => onSelect(section)}
            >
                <Icon className={cn('size-4.5', active === section && 'text-(--deck-accent)')} name={SECTIONS[section].icon} />
                {SECTIONS[section].title}
            </button>
        ))}
    </nav>
);

const TabBar = ({ active, onSelect }: { active: ESection; onSelect: (section: ESection) => void }) => (
    <nav
        aria-label="Sections"
        className="absolute inset-x-2 bottom-2 z-30 flex justify-between gap-0.5 overflow-x-auto rounded-[18px] border border-white/10 bg-[#0e1016]/90 p-1.5 shadow-[0_12px_40px_-10px_rgba(0,0,0,.7)] backdrop-blur-xl md:hidden [scrollbar-width:none]"
    >
        {ORDER.map((section) => (
            <button
                key={section}
                type="button"
                aria-label={SECTIONS[section].title}
                aria-current={active === section ? 'page' : undefined}
                className={cn(
                    'flex min-w-11 flex-1 flex-col items-center gap-0.5 rounded-[12px] px-1 py-1.5 text-[9.5px] font-semibold transition-colors',
                    active === section
                        ? 'bg-[color-mix(in_oklab,var(--deck-accent)_16%,transparent)] text-(--deck-accent)'
                        : 'text-(--deck-fg-3)',
                )}
                onClick={() => onSelect(section)}
            >
                <Icon className="size-4.5" name={SECTIONS[section].icon} />
                <span className="truncate">{SECTIONS[section].title.split(' ')[0]}</span>
            </button>
        ))}
    </nav>
);

const Offline = ({ connection }: { connection: EConnection }) => (
    <div className="flex min-h-[60svh] flex-col items-center justify-center px-8 text-center">
        <span className="relative flex size-16 items-center justify-center rounded-full border border-white/10 bg-white/4 text-(--deck-fg-3)">
            {connection === EConnection.Connecting ? <span className="osc-orb-ring absolute -inset-1 rounded-full" /> : null}
            <Icon className="size-7" name="broadcast" stroke={1.6} />
        </span>
        <h2 className="mt-4 text-[16px] font-semibold text-(--deck-fg)">
            {connection === EConnection.Connecting ? 'Connecting to the bot…' : 'The bot is not reachable'}
        </h2>
        <p className="mt-1 max-w-80 text-[12.5px] leading-relaxed text-(--deck-fg-3)">
            {connection === EConnection.Connecting
                ? 'One moment.'
                : 'If this is your phone, check that it is on the same Wi-Fi and that "Control from your phone" is still on.'}
        </p>
    </div>
);

const Toast = ({ notice }: { notice: Notice | null }) => {
    const [visible, setVisible] = useState<number | null>(null);
    const mounted = useRef(notice?.id ?? 0);
    useEffect(() => {
        if (!notice || notice.id === mounted.current) return;
        setVisible(notice.id);
        const timer = window.setTimeout(() => setVisible(null), 2600);
        return () => window.clearTimeout(timer);
    }, [notice]);
    if (!notice || visible !== notice.id) return null;
    return (
        <div
            role="status"
            className={cn(
                'pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto flex w-fit max-w-[88%] items-center gap-2 rounded-full border px-4 py-2 text-[12.5px] font-semibold shadow-[0_12px_32px_rgba(0,0,0,.5)] motion-safe:animate-[osc-rise_200ms_ease-out] md:bottom-6',
                notice.ok
                    ? 'border-[color-mix(in_oklab,var(--deck-accent)_40%,transparent)] bg-[#0e1016]/95 text-(--deck-fg)'
                    : 'border-red-400/40 bg-[#1a0e10]/95 text-red-100',
            )}
        >
            <Icon
                className={cn('size-3.5', notice.ok ? 'text-(--deck-accent)' : 'text-red-300')}
                name={notice.ok ? 'check' : 'alert'}
                stroke={2.2}
            />
            {notice.text}
        </div>
    );
};
