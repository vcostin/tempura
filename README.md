# Tempura

<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="Tempura — minimalist shrimp icon" width="128" height="128" />
</p>

Premium focus-rhythm timer for desktop — structured intervals, flexible flow techniques, local-first, tray-native.

Timing matters. Tempura stays calm, polished, and entirely on your machine: **no accounts, no cloud, no sync.**

**[Download the latest desktop build](https://vcostin.github.io/tempura/)** for Linux, Windows, or macOS.

Windows SmartScreen and macOS Gatekeeper may warn on first open (unsigned builds).

## Develop

[Deno](https://deno.land/) 2.x and Rust stable ([Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)):

```bash
deno install
deno task tauri:dev
```

## Features

- **Techniques**: Classic (25/5), Sprint (15/3), Deep (50/10), 52/17, Ultradian (90/20), Flowtime, Hybrid, plus custom rhythms
- **Session**: countdown owned by the native side (correct while hidden / across sleep)
- **Tray**: close the window to hide; quit from the tray or Settings
- **Notifications**: phase complete; optional sound and halfway tick
- **Local stats**, themes, and optional updates from GitHub Releases (About)

### Keyboard

| Key | Action |
|-----|--------|
| `Space` | Start / pause / resume |
| `S` | Skip phase |
| `,` or `Ctrl+,` | Settings |
| `Esc` | Back / hide to tray |

Keyboard and dialogs are first-class. Screen readers on the timer UI should work; tray and OS notifications depend on the OS.

## Privacy

Presets, settings, and history stay in local SQLite. No accounts, no cloud, no sync. Optional update checks ask GitHub for the latest release and, if you update, download the installer from there.

## Releasing

See [docs/releasing.md](docs/releasing.md).

## License

[MIT](LICENSE) © 2026 Vadim Costin

App icon shrimp mark adapted from [Twemoji](https://github.com/jdecked/twemoji) (CC-BY 4.0); see `assets/ICON-ATTRIBUTION.txt`.
