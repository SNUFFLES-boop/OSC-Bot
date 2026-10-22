# OSC Bot

A standalone Windows desktop app that drives VRChat over OSC: a live chatbox status, now playing, PC stats, heart rate, weather, AFK detection, avatar parameter sync, input bindings, OSC relays and a packet monitor. It runs in the tray, and you can also control it from your phone.

## Download

Every push builds the Windows app on GitHub Actions. Open the latest run under **Actions → Build Windows app** and download the **OSC-Bot-windows** artifact. It contains:

- `OSC-Bot-<version>-portable.exe`: run it directly, nothing to install.
- `OSC-Bot-<version>-setup.exe`: an installer with a Start menu entry and an uninstaller.

Pushing a tag such as `v1.0.0` also publishes both files as a GitHub release.

The builds are not code-signed, so Windows SmartScreen may warn the first time you run one. Choose **More info → Run anyway**.

## VRChat setup

1. In VRChat, open the Action Menu → **Options → OSC → Enabled**.
2. Start OSC Bot. It listens on UDP **9001** (what VRChat sends) and talks to VRChat on **9000**.
3. The dashboard shows **VRChat connected** as soon as the first packet arrives.

If another OSC app already uses 9001 (VRCFaceTracking, a heart-rate app…), OSC Bot keeps working in send-only mode so the chatbox still updates. To run them together, give OSC Bot port 9001 and add a **relay** for each of the other apps (Network → Relays).

For a standalone Quest, set the VRChat host to the headset's IP address and turn on **Accept OSC from other devices**.

## Features

**Chatbox**
- Rotating messages, each with a condition: always, while music plays, while nothing plays, when AFK, when active, or when a heart rate is available.
- More than 30 live tokens, such as `{time}`, `{song}`, `{song_bar}`, `{cpu}`, `{gpu_temp}`, `{heart_rate}`, `{weather}`, `{afk_time}` and `{muted}`. There are also parametric tokens: `{time:Europe/Paris}`, `{param:VelocityX}`, `{random:hi|hey|yo}` and `{countdown:2026-12-31}`. A line whose tokens are all empty is dropped.
- A song announcement when the track changes, a dedicated AFK message, the typing indicator, an optional notification sound and quick phrases you can send in one tap.
- VRChat's limits are enforced for you: 144 characters, 9 lines, and at least 1.6 s between messages (the newest message wins).

**Sources**
- Now playing from Windows media controls (Spotify, browsers, Apple Music, VLC…), with play/pause, next and previous.
- CPU, RAM and GPU load. The GPU comes from `nvidia-smi`, with a fallback to Windows performance counters for AMD and Intel, and includes temperature and VRAM.
- Heart rate from a Pulsoid token, or from any app that sends it over OSC.
- Weather from Open-Meteo, which needs no account.
- AFK from VRChat's own AFK flag and/or keyboard and mouse idle time.

**Avatar sync**: sends live values to avatar parameters as float, int or bool: heart rate, CPU, RAM, GPU, hour, minute, second, music playing, music progress and AFK. Clock presets are included for wristwatches.

**Bindings**: turns avatar buttons, contacts, TouchOSC or Stream Deck inputs into actions:
- send a chatbox message, pause or resume the chatbox, skip to the next message or clear it;
- play/pause, next or previous track;
- send any OSC message;
- toggle AFK.

**Learn** mode picks the next address it receives.

**Network**
- Relays forward everything VRChat sends (or only matching addresses) to other apps.
- The phone remote opens the panel on any phone on the same Wi-Fi through a secret link and a QR code.
- Backup and restore the whole profile as JSON.

**Monitor**: every packet in and out, with filters and search. It can hide VRChat's built-ins, pause, bind straight from a packet, and has a composer to send test messages.

**Look and layout**
- Five themes, any accent color, three densities, UI size from 90 to 120%, adjustable glow and reduced motion.
- **Pages** layout, or **Board** layout where every section is a card you can reorder, collapse and hide.

**App**: start with Windows, start minimized, close to the tray, and tray controls for the chatbox and music.

## Development

Requires Node 22 and pnpm 10.

```sh
pnpm install
pnpm dev        # engine + Vite on http://127.0.0.1:5180 (headless, no Electron)
pnpm start      # build first with `pnpm build`, then opens the Electron window
pnpm test       # unit tests (codec, templates, engine)
pnpm lint
pnpm dist:win   # Windows portable exe + installer into release/ (run on Windows)
```

`pnpm serve` runs the engine without Electron and serves the panel on http://127.0.0.1:9876. It keeps its profile in `./osc-bot.json`, or in the path given by the `OSC_BOT_CONFIG` environment variable.

Layout:
- `src/engine/`: the OSC codec, UDP transport, providers (media, system, heart rate, weather), the chatbox and bindings engine, and the HTTP/WebSocket panel server.
- `src/electron/`: the window, tray, single-instance lock and start-with-Windows.
- `src/ui/`: the panel (Preact + Tailwind).
- `src/shared/`: the config model, protocol and chatbox templates shared by the engine and the UI.

## Privacy and security

OSC has no authentication, so the bot only accepts OSC from this PC unless you turn on **Accept OSC from other devices**. The panel is only reachable from this PC unless you turn on **Control from your phone**, and phones then need the secret link. Your profile is stored in the app's user data folder. Nothing is sent anywhere except to VRChat, the relays you add, Pulsoid (when you use a token) and Open-Meteo (when weather is on).

## License

Apache-2.0
