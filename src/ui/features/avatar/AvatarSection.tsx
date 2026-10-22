import { cn } from '@/shared/lib/ui';
import { useNow } from '@/shared/lib/use-now';
import { CommitInput } from '@/shared/ui/CommitInput';
import { Icon } from '@/shared/ui/Icon';
import { IconButton } from '@/shared/ui/IconButton';
import { Eyebrow, GhostButton, SelectField } from '@/shared/ui/Panel';
import { Segmented } from '@/shared/ui/Segmented';
import { Switch } from '@/shared/ui/Switch';
import { outputArgs } from '../../../engine/outputs';
import { type AvatarOutput, createOutput, EOutputSource, EParamType, isValidAddress, LIMITS } from '../../../shared/config';
import type { SectionProps } from '../../app/section-props';

export const SOURCE_LABELS: Record<EOutputSource, string> = {
    [EOutputSource.HeartRate]: 'Heart rate',
    [EOutputSource.Cpu]: 'CPU load',
    [EOutputSource.Ram]: 'RAM use',
    [EOutputSource.Gpu]: 'GPU load',
    [EOutputSource.Hour]: 'Clock: hour',
    [EOutputSource.Minute]: 'Clock: minute',
    [EOutputSource.Second]: 'Clock: second',
    [EOutputSource.MusicPlaying]: 'Music playing',
    [EOutputSource.MusicProgress]: 'Music progress',
    [EOutputSource.Afk]: 'AFK',
};

const PRESETS: { label: string; outputs: Partial<AvatarOutput>[] }[] = [
    {
        label: 'Heart rate',
        outputs: [
            { address: '/avatar/parameters/HR', source: EOutputSource.HeartRate, type: EParamType.Int },
            { address: '/avatar/parameters/HRPercent', source: EOutputSource.HeartRate, type: EParamType.Float },
        ],
    },
    {
        label: 'Watch',
        outputs: [
            { address: '/avatar/parameters/Hours', source: EOutputSource.Hour, type: EParamType.Float },
            { address: '/avatar/parameters/Minutes', source: EOutputSource.Minute, type: EParamType.Float },
        ],
    },
    {
        label: 'PC load',
        outputs: [
            { address: '/avatar/parameters/CPU', source: EOutputSource.Cpu, type: EParamType.Float },
            { address: '/avatar/parameters/GPU', source: EOutputSource.Gpu, type: EParamType.Float },
        ],
    },
    {
        label: 'Music',
        outputs: [
            { address: '/avatar/parameters/MusicPlaying', source: EOutputSource.MusicPlaying, type: EParamType.Bool },
            { address: '/avatar/parameters/MusicProgress', source: EOutputSource.MusicProgress, type: EParamType.Float },
        ],
    },
    { label: 'AFK', outputs: [{ address: '/avatar/parameters/BotAFK', source: EOutputSource.Afk, type: EParamType.Bool }] },
];

export const AvatarSection = ({ config, live, update }: SectionProps) => {
    const now = useNow(1000);
    const outputs = config.outputs;
    const params = Object.keys(live.params).sort();

    const setOutputs = (next: AvatarOutput[]) => update((current) => ({ ...current, outputs: next.slice(0, LIMITS.maxOutputs) }), true);
    const patch = (id: string, change: Partial<AvatarOutput>) =>
        setOutputs(outputs.map((output) => (output.id === id ? { ...output, ...change } : output)));

    const addPreset = (preset: (typeof PRESETS)[number]) => {
        const taken = new Set(outputs.map((output) => output.address));
        setOutputs([
            ...outputs,
            ...preset.outputs.filter((output) => !taken.has(output.address as string)).map((output) => createOutput(output)),
        ]);
    };

    return (
        <div className="space-y-3">
            <p className="text-[12.5px] leading-relaxed text-(--deck-fg-3)">
                Send live values to avatar parameters so your avatar can react: a heart that beats at your BPM, a working wristwatch, a
                PC-load meter. Floats are 0–1, ints carry the real number, bools are on/off. Values are only sent when they change.
            </p>
            <div>
                <Eyebrow>Add a preset</Eyebrow>
                <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((preset) => (
                        <GhostButton key={preset.label} icon="plus" onClick={() => addPreset(preset)}>
                            {preset.label}
                        </GhostButton>
                    ))}
                    <GhostButton
                        icon="plus"
                        onClick={() => setOutputs([...outputs, createOutput({ address: '/avatar/parameters/MyParam' })])}
                    >
                        Custom
                    </GhostButton>
                </div>
            </div>

            {outputs.length === 0 ? (
                <div className="rounded-[13px] border border-dashed border-white/12 px-4 py-6 text-center text-[12.5px] text-(--deck-fg-3)">
                    <Icon className="mx-auto mb-2 size-6 text-(--deck-fg-4)" name="user" />
                    No avatar parameters synced yet. Add a preset above.
                </div>
            ) : (
                <div className="space-y-2">
                    <datalist id="avatar-params">
                        {params.map((name) => (
                            <option key={name} value={`/avatar/parameters/${name}`} />
                        ))}
                    </datalist>
                    {outputs.map((output) => {
                        const args = outputArgs(output, live, now, config.heartRate.maxBpm);
                        const value = args ? String(args[0].value) : '—';
                        return (
                            <div
                                key={output.id}
                                className={cn(
                                    'grid items-center gap-2 rounded-[13px] border bg-black/15 p-2.5 md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_170px_auto_auto]',
                                    output.enabled ? 'border-white/8' : 'border-white/5 opacity-60',
                                )}
                            >
                                <Switch
                                    size="sm"
                                    checked={output.enabled}
                                    label={`Sync ${output.address}`}
                                    onChange={(enabled) => patch(output.id, { enabled })}
                                />
                                <CommitInput
                                    mono
                                    value={output.address}
                                    label="Avatar parameter address"
                                    list="avatar-params"
                                    className="h-9"
                                    onCommit={(address) => {
                                        if (!isValidAddress(address.trim())) return false;
                                        patch(output.id, { address: address.trim() });
                                        return true;
                                    }}
                                />
                                <SelectField
                                    label="Value"
                                    value={output.source}
                                    options={Object.values(EOutputSource).map((source) => ({
                                        value: source,
                                        label: SOURCE_LABELS[source],
                                    }))}
                                    onChange={(source) => patch(output.id, { source })}
                                />
                                <Segmented
                                    size="sm"
                                    label="Parameter type"
                                    value={output.type}
                                    options={[
                                        { value: EParamType.Float, label: 'Float' },
                                        { value: EParamType.Int, label: 'Int' },
                                        { value: EParamType.Bool, label: 'Bool' },
                                    ]}
                                    onChange={(type) => patch(output.id, { type })}
                                />
                                <span
                                    key={value}
                                    className="min-w-14 rounded-[7px] bg-white/5 px-2 py-1 text-center font-mono text-[11.5px] tabular-nums text-(--deck-accent) motion-safe:animate-[osc-rise_200ms_ease-out]"
                                >
                                    {value}
                                </span>
                                <IconButton
                                    size="sm"
                                    icon="trash"
                                    label="Remove"
                                    onClick={() => setOutputs(outputs.filter((entry) => entry.id !== output.id))}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
