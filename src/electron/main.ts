import path from 'node:path';

import { app, BrowserWindow, Menu, nativeImage, powerMonitor, shell, Tray } from 'electron';
import { createEngine, type Engine } from '../engine/engine';
import { createPanelServer } from '../engine/server';
import { consoleLog, createConfigStore } from '../engine/store';
import type { BotConfig } from '../shared/config';

const startHidden = process.argv.includes('--hidden');

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    let window: BrowserWindow | null = null;
    let tray: Tray | null = null;
    let engine: Engine | null = null;
    let quitting = false;

    const server = createPanelServer({
        uiRoot: path.join(__dirname, 'ui'),
        log: consoleLog,
        onUrlChange: (url) => {
            if (window && !window.isDestroyed()) void window.loadURL(url);
        },
    });

    const icon = () => nativeImage.createFromPath(path.join(__dirname, 'ui', 'icon.png'));

    function createWindow(show: boolean) {
        window = new BrowserWindow({
            width: 1180,
            height: 820,
            minWidth: 380,
            minHeight: 560,
            show,
            backgroundColor: '#07080b',
            title: 'OSC Bot',
            icon: icon(),
            autoHideMenuBar: true,
            webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
        });
        window.setMenuBarVisibility(false);
        window.webContents.setWindowOpenHandler(({ url }) => {
            if (/^https?:\/\//.test(url)) void shell.openExternal(url);
            return { action: 'deny' };
        });
        window.on('close', (event) => {
            if (!quitting && engine?.config.app.minimizeToTray) {
                event.preventDefault();
                window?.hide();
            }
        });
        window.on('closed', () => {
            window = null;
        });
        void window.loadURL(server.url());
    }

    function showWindow() {
        if (!window) createWindow(true);
        window?.show();
        if (window?.isMinimized()) window.restore();
        window?.focus();
    }

    function updateTray(config: BotConfig) {
        if (!tray) {
            tray = new Tray(icon().resize({ width: 16, height: 16 }));
            tray.setToolTip('OSC Bot');
            tray.on('click', showWindow);
        }
        tray.setContextMenu(
            Menu.buildFromTemplate([
                { label: 'Open OSC Bot', click: showWindow },
                { type: 'separator' },
                {
                    label: 'Chatbox paused',
                    type: 'checkbox',
                    checked: Boolean(engine?.getState().status.chatboxPaused),
                    click: () => {
                        engine?.command({ action: 'chatbox_toggle' });
                        if (engine) updateTray(engine.config);
                    },
                },
                { label: 'Next chatbox message', click: () => engine?.command({ action: 'chatbox_next' }) },
                { label: 'Clear chatbox', click: () => engine?.command({ action: 'chatbox_clear' }) },
                { type: 'separator' },
                { label: 'Play / pause music', click: () => engine?.command({ action: 'media', op: 'play_pause' }) },
                { label: 'Next track', click: () => engine?.command({ action: 'media', op: 'next' }) },
                { type: 'separator' },
                {
                    label: 'Quit',
                    click: () => {
                        quitting = true;
                        app.quit();
                    },
                },
            ]),
        );
        void config;
    }

    function applyAppSettings(config: BotConfig) {
        if (app.isPackaged) {
            app.setLoginItemSettings({ openAtLogin: config.app.startWithWindows, args: ['--hidden'] });
        }
        updateTray(config);
    }

    app.on('second-instance', showWindow);

    app.whenReady().then(() => {
        app.setAppUserModelId('com.oscbot.app');
        engine = createEngine({
            store: createConfigStore(path.join(app.getPath('userData'), 'profile.json'), consoleLog),
            log: consoleLog,
            publish: (message) => server.broadcast(message),
            host: {
                info: () => ({
                    kind: 'electron',
                    version: app.getVersion(),
                    platform: process.platform,
                    remoteUrls: server.remoteUrls(),
                }),
                idleSeconds: () => powerMonitor.getSystemIdleTime(),
                onConfigApplied: (config) => applyAppSettings(config),
            },
        });
        server.attach(engine);
        applyAppSettings(engine.config);
        const hidden = startHidden || engine.config.app.startMinimized;
        createWindow(!hidden);
    });

    // With the window hidden in the tray the app keeps running until Quit.
    app.on('window-all-closed', () => {
        if (!engine?.config.app.minimizeToTray) {
            quitting = true;
            app.quit();
        }
    });

    app.on('before-quit', () => {
        quitting = true;
        engine?.close();
        server.close();
    });
}
