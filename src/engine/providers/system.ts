import { execFile, spawn } from 'node:child_process';
import os from 'node:os';
import { createInterface } from 'node:readline';

import { EProviderState, type ProviderStatus, type SystemState } from '../../shared/protocol';

const SAMPLE_MS = 2000;
const GIB = 1024 ** 3;

// Non-NVIDIA GPUs: Windows' own "GPU Engine" counters, summed over 3D engines.
const GPU_COUNTER_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
while ($true) {
  $v = (Get-Counter '\GPU Engine(*engtype_3D)\Utilization Percentage').CounterSamples | Measure-Object CookedValue -Sum
  Write-Output ([math]::Round([math]::Min(100, $v.Sum), 1))
  Start-Sleep -Milliseconds 1500
}
`;

export type SystemProvider = ReturnType<typeof createSystemProvider>;

/** CPU and RAM from Node; GPU from nvidia-smi when present, else Windows perf counters. */
export function createSystemProvider({ onChange }: { onChange: () => void }) {
    let timer: ReturnType<typeof setInterval> | null = null;
    let previous = cpuTimes();
    let gpuEnabled = true;
    let gpuMode: 'unknown' | 'nvidia' | 'counters' | 'none' = 'unknown';
    let counterProcess: ReturnType<typeof spawn> | null = null;
    let state: SystemState | null = null;
    let status: ProviderStatus = { state: EProviderState.Off, detail: null };
    let gpu: Pick<SystemState, 'gpu' | 'gpuTemp' | 'vramUsedGb' | 'gpuName'> = {
        gpu: null,
        gpuTemp: null,
        vramUsedGb: null,
        gpuName: null,
    };

    function sample() {
        const current = cpuTimes();
        const idle = current.idle - previous.idle;
        const total = current.total - previous.total;
        previous = current;
        const total_ = os.totalmem();
        const used = total_ - os.freemem();
        state = {
            cpu: total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : null,
            ramPercent: (used / total_) * 100,
            ramUsedGb: used / GIB,
            ramTotalGb: total_ / GIB,
            ...gpu,
        };
        onChange();
        if (gpuEnabled) sampleGpu();
    }

    function sampleGpu() {
        if (gpuMode === 'unknown' || gpuMode === 'nvidia') {
            execFile(
                'nvidia-smi',
                ['--query-gpu=utilization.gpu,temperature.gpu,memory.used,name', '--format=csv,noheader,nounits'],
                { timeout: 3000, windowsHide: true },
                (error, stdout) => {
                    if (error) {
                        if (gpuMode === 'unknown') startCounters();
                        return;
                    }
                    gpuMode = 'nvidia';
                    const [util, temp, memory, ...name] = stdout.trim().split('\n')[0].split(',');
                    gpu = {
                        gpu: Number(util) || 0,
                        gpuTemp: Number(temp) || null,
                        vramUsedGb: Number(memory) / 1024 || null,
                        gpuName: name.join(',').trim() || null,
                    };
                },
            );
        }
    }

    function startCounters() {
        if (process.platform !== 'win32') {
            gpuMode = 'none';
            return;
        }
        gpuMode = 'counters';
        const encoded = Buffer.from(GPU_COUNTER_SCRIPT, 'utf16le').toString('base64');
        try {
            counterProcess = spawn(
                'powershell.exe',
                ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
                { windowsHide: true },
            );
        } catch {
            gpuMode = 'none';
            return;
        }
        createInterface({ input: counterProcess.stdout! }).on('line', (line) => {
            const value = Number(line.trim().replace(',', '.'));
            if (Number.isFinite(value)) gpu = { ...gpu, gpu: value };
        });
        counterProcess.on('exit', () => {
            counterProcess = null;
        });
    }

    return {
        start(includeGpu: boolean) {
            gpuEnabled = includeGpu;
            if (timer) return;
            previous = cpuTimes();
            status = { state: EProviderState.Ok, detail: null };
            timer = setInterval(sample, SAMPLE_MS);
            timer.unref?.();
            sample();
        },
        setGpu(includeGpu: boolean) {
            gpuEnabled = includeGpu;
            if (!includeGpu) {
                counterProcess?.kill();
                counterProcess = null;
                gpuMode = 'unknown';
                gpu = { gpu: null, gpuTemp: null, vramUsedGb: null, gpuName: null };
            }
        },
        stop() {
            if (timer) clearInterval(timer);
            timer = null;
            counterProcess?.kill();
            counterProcess = null;
            gpuMode = 'unknown';
            state = null;
            status = { state: EProviderState.Off, detail: null };
        },
        get system() {
            return state;
        },
        get status() {
            return status;
        },
    };
}

function cpuTimes() {
    let idle = 0;
    let total = 0;
    for (const cpu of os.cpus()) {
        const times = cpu.times;
        idle += times.idle;
        total += times.user + times.nice + times.sys + times.idle + times.irq;
    }
    return { idle, total };
}
