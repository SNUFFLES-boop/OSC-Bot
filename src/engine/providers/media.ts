import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { EProviderState, type MediaOperation, type MusicState, type ProviderStatus } from '../../shared/protocol';

// PowerShell's generic-type backtick (IAsyncOperation`1) has to be interpolated into the template.
const TICK = '`';

/**
 * Reads Windows' "now playing" (System Media Transport Controls: Spotify, browsers, media
 * players…) through one resident PowerShell process using WinRT, so no native module ships.
 * It prints one JSON line per second and accepts play/pause/next/previous on stdin.
 */
const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${TICK}1'
})[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
if (-not $mgr) { Write-Output '{"error":"unavailable"}'; exit 1 }
$reader = [powershell]::Create().AddScript('[Console]::In.ReadLine()')
$pending = $reader.BeginInvoke()
while ($true) {
  if ($pending.IsCompleted) {
    $cmd = "$($reader.EndInvoke($pending))".Trim()
    if ($cmd -eq '') { exit 0 }
    $s = $mgr.GetCurrentSession()
    if ($s) {
      switch ($cmd) {
        'play_pause' { $null = Await ($s.TryTogglePlayPauseAsync()) ([bool]) }
        'next' { $null = Await ($s.TrySkipNextAsync()) ([bool]) }
        'previous' { $null = Await ($s.TrySkipPreviousAsync()) ([bool]) }
      }
    }
    $reader = [powershell]::Create().AddScript('[Console]::In.ReadLine()')
    $pending = $reader.BeginInvoke()
  }
  $s = $mgr.GetCurrentSession()
  if ($s) {
    $p = Await ($s.TryGetMediaPropertiesAsync()) ($propsType)
    $info = $s.GetPlaybackInfo()
    $tl = $s.GetTimelineProperties()
    [pscustomobject]@{
      title = "$($p.Title)"; artist = "$($p.Artist)"; album = "$($p.AlbumTitle)"
      player = "$($s.SourceAppUserModelId)"; playing = ($info.PlaybackStatus -eq 4)
      positionMs = [int64]$tl.Position.TotalMilliseconds; durationMs = [int64]$tl.EndTime.TotalMilliseconds
      updatedAt = [int64]$tl.LastUpdatedTime.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Compress
  } else { Write-Output '{"none":true}' }
  Start-Sleep -Milliseconds 1000
}
`;

const RESTART_DELAY_MS = 15000;

export type MediaProvider = ReturnType<typeof createMediaProvider>;

export function createMediaProvider({
    onChange,
    platform = process.platform,
    spawnProcess = spawn,
}: {
    onChange: () => void;
    platform?: NodeJS.Platform;
    spawnProcess?: typeof spawn;
}) {
    let child: ChildProcessWithoutNullStreams | null = null;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let music: MusicState | null = null;
    let status: ProviderStatus = { state: EProviderState.Off, detail: null };
    let signature = '';

    function setStatus(state: EProviderState, detail: string | null = null) {
        if (status.state === state && status.detail === detail) return;
        status = { state, detail };
        onChange();
    }

    function start() {
        if (running) return;
        running = true;
        if (platform !== 'win32') {
            setStatus(EProviderState.Unsupported, 'Now playing reads Windows media controls.');
            return;
        }
        launch();
    }

    function launch() {
        setStatus(EProviderState.Starting);
        const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
        try {
            child = spawnProcess(
                'powershell.exe',
                ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
                { windowsHide: true },
            ) as ChildProcessWithoutNullStreams;
        } catch (error) {
            setStatus(EProviderState.Error, error instanceof Error ? error.message : String(error));
            return;
        }

        const lines = createInterface({ input: child.stdout });
        lines.on('line', (line) => handleLine(line));
        child.on('error', (error) => setStatus(EProviderState.Error, error.message));
        child.on('exit', () => {
            child = null;
            if (!running) return;
            setStatus(EProviderState.Error, 'Media reader stopped; retrying.');
            restartTimer = setTimeout(launch, RESTART_DELAY_MS);
            restartTimer.unref?.();
        });
    }

    function handleLine(line: string) {
        let data: Record<string, unknown>;
        try {
            data = JSON.parse(line);
        } catch {
            return;
        }
        if (data.error) {
            setStatus(EProviderState.Unsupported, 'Windows media controls are not available.');
            return;
        }
        setStatus(EProviderState.Ok);
        const next = data.none ? null : toMusic(data);
        const nextSignature = JSON.stringify(next && { ...next, updatedAt: 0, positionMs: 0 });
        const positionJump = next && music ? Math.abs(next.positionMs - music.positionMs) > 1500 : false;
        if (nextSignature !== signature || positionJump || next?.updatedAt !== music?.updatedAt) {
            music = next;
            signature = nextSignature;
            onChange();
        }
    }

    function stop() {
        running = false;
        if (restartTimer) clearTimeout(restartTimer);
        restartTimer = null;
        try {
            child?.stdin.end();
            child?.kill();
        } catch {}
        child = null;
        music = null;
        signature = '';
        setStatus(EProviderState.Off);
    }

    return {
        start,
        stop,
        control(op: MediaOperation): boolean {
            if (!child) return false;
            child.stdin.write(`${op}\n`);
            return true;
        },
        get music() {
            return music;
        },
        get status() {
            return status;
        },
    };
}

function toMusic(data: Record<string, unknown>): MusicState | null {
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title) return null;
    return {
        title,
        artist: typeof data.artist === 'string' ? data.artist.trim() : '',
        album: typeof data.album === 'string' ? data.album.trim() : '',
        player: prettyPlayer(typeof data.player === 'string' ? data.player : ''),
        playing: data.playing === true,
        positionMs: Math.max(0, Number(data.positionMs) || 0),
        durationMs: Math.max(0, Number(data.durationMs) || 0),
        updatedAt: Number(data.updatedAt) > 0 ? Number(data.updatedAt) : Date.now(),
    };
}

/** "Spotify.exe" / "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify" → "Spotify". */
export function prettyPlayer(id: string): string {
    const tail = id.split('!').pop() ?? id;
    const name = tail.replace(/\.exe$/i, '').split(/[._]/)[0] ?? '';
    const known: Record<string, string> = { msedge: 'Edge', chrome: 'Chrome', firefox: 'Firefox', vlc: 'VLC' };
    return known[name.toLowerCase()] ?? name;
}
