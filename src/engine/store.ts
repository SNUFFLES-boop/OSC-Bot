import fs from 'node:fs';
import path from 'node:path';

import { type BotConfig, createDefaultConfig, normalizeConfig } from '../shared/config';

export type LogFn = (level: 'info' | 'warn' | 'error', message: string, error?: unknown) => void;

export type ConfigStore = {
    readonly file: string | null;
    load(): BotConfig;
    save(config: BotConfig): boolean;
};

/** JSON profile on disk; without a file (tests) it lives in memory only. */
export function createConfigStore(file: string | null, log: LogFn): ConfigStore {
    return {
        file,
        load() {
            if (!file) return createDefaultConfig();
            try {
                return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
            } catch (error) {
                if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
                    log('warn', `Ignoring unreadable profile at ${file}.`, error);
                }
                return createDefaultConfig();
            }
        },
        save(config) {
            if (!file) return true;
            // Write-then-rename: a crash mid-save never leaves a truncated profile.
            const temporary = `${file}.${process.pid}.tmp`;
            try {
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
                fs.renameSync(temporary, file);
                return true;
            } catch (error) {
                log('warn', `Failed to save the profile to ${file}.`, error);
                try {
                    fs.rmSync(temporary, { force: true });
                } catch {}
                return false;
            }
        },
    };
}

export function consoleLog(level: 'info' | 'warn' | 'error', message: string, error?: unknown) {
    const line = `[osc-bot] ${message}`;
    if (level === 'info') console.info(line);
    else console[level](line, error ?? '');
}
