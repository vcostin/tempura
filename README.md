# Tempura

<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Tempura — minimalist shrimp icon" width="128" height="128" />
</p>

Premium focus-rhythm timer for desktop — structured intervals, flexible flow techniques, local-first, tray-native.

Timing matters. Tempura stays calm, polished, and entirely on your machine: **no accounts, no cloud, no sync.**

**[Download the latest desktop build](https://vcostin.github.io/tempura/)** for Linux, Windows, or macOS.

## Requirements

- [Deno](https://deno.land/) 2.x (primary toolchain)
- Rust stable + system deps for [Tauri 2](https://v2.tauri.app/start/prerequisites/)

## Develop

```bash
deno install
deno task tauri:dev
```

| Task | What it does |
|------|----------------|
| `deno task dev` | Vite frontend only |
| `deno task build` | Typecheck + Vite production build |
| `deno task tauri:dev` | Full Tauri + Vite |
| `deno task tauri:build` | Packaged desktop app |
| `deno task version 0.2.0` | Bump version in package.json, Cargo.toml, tauri.conf.json |

### Optional Node fallback

`package.json` mirrors the same scripts if Deno isn’t available:

```bash
npm install
npm run tauri:dev
```

Day-to-day docs assume Deno.

## Features

- **Techniques**: Classic (25/5), Sprint (15/3), Deep (50/10), 52/17, Ultradian (90/20), Flowtime, Hybrid, plus custom CRUD in SQLite
- **Guide**: in-app Techniques page + chip tooltips (“best for…”)
- **Session engine**: Rust owns the countdown (correct while hidden / across sleep); Start, Pause/Resume, Skip, Reset, Stop
- **System tray**: always present; close window hides to tray; live tooltip; Quit from tray or Settings
- **Notifications**: focus / break / long-break complete; optional halfway tick; sound toggle
- **Settings**: launch at login, start minimized, theme, notify/sound, defaults, flow ratio, privacy blurb
- **Themes**: Batter (default, icon palette), Mist, Grove, Dusk, Sandstone
- **Stats**: focus minutes today, cycles, sessions, streak (local only)

### Keyboard (desktop)

| Key | Action |
|-----|--------|
| `Space` | Start / pause / resume |
| `S` | Skip phase |
| `,` or `Ctrl+,` | Settings |
| `Esc` | Back / hide to tray |

## Privacy

Presets, settings, and session history live in local SQLite under the app data directory. Nothing is uploaded. No accounts, no cloud, no sync.

## Project layout

```
src/                 React + TypeScript UI (timer, settings, guide, stats)
src/lib/             API bridge, platform gating, technique guide copy
src-tauri/           Rust: timer engine, SQLite, tray, notifications, autostart
deno.json            Deno tasks (primary)
package.json         Node fallback scripts
```

Desktop-only concerns (tray, autostart, hide-to-tray) are gated so a future mobile entrypoint can reuse the core focus UI.

## Notes

- **Windows notifications** look correct for installed/packaged builds; unpackaged `tauri dev` may show a PowerShell icon.
- Tray, autostart, and hide-to-tray are desktop-only. The UI is responsive for a later mobile port; v1 ships desktop only.
- Linux AppImage builds set `NO_STRIP=true` (linuxdeploy’s bundled `strip` breaks on modern ELF) and `APPIMAGE_EXTRACT_AND_RUN=1` in the Deno tasks and the Release workflow. If you use the npm fallback on Linux, prefix the command the same way. You may also need `fuse2`, `squashfs-tools`, and `patchelf` installed.

## Releasing

Version lives in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`. Keep them in lockstep, then push a `v*` tag:

```bash
deno task version 0.2.0
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "Release v0.2.0"
git tag v0.2.0
git push origin main --tags
```

GitHub Actions builds Linux (AppImage + deb), Windows (MSI + NSIS), and macOS (Apple Silicon + Intel), then attaches them to the GitHub Release. The [download page](https://vcostin.github.io/tempura/) reads that release.

The first public tag is `v0.1.0`. Builds are unsigned, so Windows SmartScreen and macOS Gatekeeper may warn on first open.

## License

[MIT](LICENSE) © 2026 Vadim Costin

App icon shrimp mark adapted from [Twemoji](https://github.com/jdecked/twemoji) (CC-BY 4.0); see `assets/ICON-ATTRIBUTION.txt`.
