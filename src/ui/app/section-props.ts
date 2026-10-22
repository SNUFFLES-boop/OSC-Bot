import type { BotConfig } from '../../shared/config';
import type { ActivityEntry, BotStatus, HostInfo, LiveState } from '../../shared/protocol';
import type { SendCommand, UpdateConfig } from './connection';

/** What every section receives once the bot has sent its first state. */
export type SectionProps = {
    config: BotConfig;
    status: BotStatus;
    live: LiveState;
    host: HostInfo;
    activity: ActivityEntry[];
    update: UpdateConfig;
    command: SendCommand;
    notify: (ok: boolean, text: string) => void;
};
