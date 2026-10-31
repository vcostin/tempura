# Security

Maintainer notes on what the Tempura desktop binary can do, and what a
read-only pass of the Tauri/Rust surface actually found.

This is not a pentest, not a CVE scrape, and not a list of enterprise
threats that do not apply. Tempura is a local-first focus timer: no
accounts, no telemetry, no extra update server. Host access is real
(tray, notifications, autostart, SQLite, GitHub Releases updater).

| | |
| --- | --- |
| **App version** | 0.5.1 |
| **Tree** | `43214c9` (`main` as of 2026-10-31). Earlier pass: 0.3.2 at `a46d817` (2026-09-19). |
| **Scope** | Tauri 2 config, Rust commands, opener, SQLite, updater CI, download site; since 0.3.2 also session export, global shortcuts, the Wayland shortcuts portal, and command-line actions |
| **Critical / High** | None found |

Related: [releasing.md](releasing.md) (ed25519 updater signing).

## Trust model

Assume the person at the keyboard is allowed to run a focus timer on
this machine. The interesting boundary is **the webview talking to
Rust**, plus **how updates are chosen and verified**.

| Assumption | What that means here |
| --- | --- |
| Single-user desktop | SQLite and settings live under the OS app-data directory. Another account on a shared box is in scope for file permissions; remote multi-tenant isolation is not. |
| No accounts / no cloud | Nothing to phish. Optional update checks hit GitHub Releases only. |
| Webview is untrusted relative to Rust | CSP + `freezePrototype` reduce XSS. They do not replace command allowlists. Anything the frontend can `invoke` is available to a capable window. |
| Updater authenticity ≠ first-run authenticity | In-app updates require an ed25519 signature that matches the pubkey baked into the binary. First install is whatever the user downloaded (SmartScreen / Gatekeeper may warn; see M2). |
| Signing secret stays off the tree | Release CI fails without `TAURI_SIGNING_PRIVATE_KEY`. Private keys are gitignored. Losing or rotating the key breaks in-app updates for already-shipped builds. |
| Other processes of the same user are trusted | `tempura --toggle` / `--skip` / `--show` reach the running app through the single-instance plugin. Anything running as you can start, pause, skip, or show/hide the window; nothing else is accepted on that path. |
| Locale catalogs are maintainer-trusted | GitHub Pages copies `locales/` onto the download site. Strings are assigned with `textContent` (L5). A locale PR can change copy, not inject HTML. |

**XSS blast radius (if someone ever got script in the webview):**
autostart on/off, updater check/install (still needs a valid ed25519
sig), relaunch, quit, timer/settings/stats, open the pinned GitHub
discussion, open the native save dialog for a session export (the user
still picks the path), register up to three global shortcuts (see L7),
and ask the Wayland portal to bind or reconfigure them (the desktop shows
its own dialog). Debug builds also expose a test notification. That is
annoying, not “unsigned update.”

## Findings

### Critical

None.

### High

None.

### Medium

#### M1 — Linux updater JSON preferred `.AppImage.tar.gz` over the rewritten AppImage

**Status.** Addressed. `pickLinux` now prefers the raw `.AppImage` (the
wayland-stripped, re-signed file). Packed `.AppImage.tar.gz` is fallback
only, for a hypothetical Release that never had a raw pair. If both
assets are present, the synthesizer warns on stderr. CI still deletes
stale tarballs before upload.

**Was.** The synthesizer preferred `.AppImage.tar.gz` first. Dual assets
on a Release could point the in-app updater at a **pre-strip** tarball
and a signature that no longer matched — the same class of mismatch that
broke AppImage self-update on v0.3.1.

**Evidence.**

- [`scripts/build-updater-json.ts`](../scripts/build-updater-json.ts) — `pickLinux` tries raw `.AppImage` first, then `.AppImage.tar.gz`.
- [`scripts/tauri-ci.ts`](../scripts/tauri-ci.ts) — `removeStaleAppImageTarballs` / `resignPatchedAppImages`.
- [`tests/unit/buildUpdaterJson.test.ts`](../tests/unit/buildUpdaterJson.test.ts) — “raw AppImage beats packed tar.gz”.
- [releasing.md](releasing.md) — strip-then-re-sign; never upload a `.sig` from before the rewrite.

#### M2 — No Authenticode / Apple notarization

**Impact.** First install is not the updater verify path. Windows
SmartScreen and macOS Gatekeeper may warn; users have to click through.
An in-app update is still checked against the pinned ed25519 pubkey.
This is already documented; it stays Medium because OS trust UI is what
most people see on day one.

**Evidence.** [releasing.md](releasing.md) (“Signing (ed25519, not Authenticode)”);
README first-open warning; [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json) `plugins.updater.pubkey`.

**Fix sketch.** When you have the org accounts: Authenticode the Windows
installers, Developer ID + notarize macOS. Do not confuse that with
rotating the Tauri updater key.

### Low

#### L1 — `debug_test_notification` was always registered

**Status.** Addressed. The command is `#[cfg(debug_assertions)]` and is
only added to `generate_handler!` in debug builds, matching
`AppInfo.debug`. The Debug page still exists after five About clicks in
release (build info, hide beetle) but does not offer a dead test-send
button.

**Was.** The Debug page was a UI gate (`localStorage` + five version
clicks). The Rust command was on the invoke handler in every build, so
XSS could fire a fixed-title OS notification.

**Evidence.** [`src-tauri/src/commands.rs`](../src-tauri/src/commands.rs);
[`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs);
[`src/components/DebugView.tsx`](../src/components/DebugView.tsx);
[`tests/unit/debugCommandGate.test.ts`](../tests/unit/debugCommandGate.test.ts).

#### L2 — Feedback opener allowed any `discussions/<digits>` URL

**Status.** Addressed. `open_feedback_url` takes no URL argument. Rust
opens `FEEDBACK_URL` (Discussion #5) only. The frontend still keeps its
own copy for the About link and clipboard.

**Was.** The frontend always sent Discussion #5, but Rust accepted any
`https://github.com/vcostin/tempura/discussions/<digits>` (tests allowed
`#12`). XSS could not open `file://` or a foreign host, but it was not
hardcoded-only to #5. `FEEDBACK_URL` in Rust was `#[allow(dead_code)]`.

**Evidence.** [`src-tauri/src/open_url.rs`](../src-tauri/src/open_url.rs) (`FEEDBACK_URL`, `open_feedback_url()`);
[`src-tauri/src/commands.rs`](../src-tauri/src/commands.rs);
[`src/lib/platform.ts`](../src/lib/platform.ts);
[`tests/unit/feedbackUrl.test.ts`](../tests/unit/feedbackUrl.test.ts).

#### L3 — SQLite lacked `0700` / `0600`

**Status.** Addressed. On Unix, `Database::open` sets the app-data
directory to `0700` and `tempura.db` plus `-wal`/`-shm` (when present)
to `0600`. Best-effort: chmod failures on exotic mounts do not refuse
startup. Windows is unchanged. `/tmp` is not chmod’d (tests and stray
paths).

**Was.** `create_dir_all` + `Connection::open` used the default umask
(often `0755` / `0644`), so another local account could read presets
and session history.

**Evidence.** [`src-tauri/src/db.rs`](../src-tauri/src/db.rs) `restrict_unix_*`;
[`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) `app_data_dir().join("tempura.db")`.

#### L4 — `window.open` fallback on opener failure

**Status.** Addressed. `openFeedback` returns true only when the Rust
command succeeds. Failure (and non-Tauri preview) returns false — no
`window.open`. About already shows Discussion #5 plus copy, with calm
“use the link” copy. There is still no `on_navigation` deny-list; CSP
`default-src 'self'` remains the brake on loading remote pages in the
webview.

**Was.** If the Rust opener failed, the UI tried
`window.open(FEEDBACK_URL, "_blank", …)`, which can pop a webview.

**Evidence.** [`src/lib/platform.ts`](../src/lib/platform.ts) `openFeedback`;
[`src/components/AboutView.tsx`](../src/components/AboutView.tsx);
[`tests/unit/feedbackUrl.test.ts`](../tests/unit/feedbackUrl.test.ts).

#### L5 — Download site `innerHTML` from locale strings

**Status.** Addressed. Linux install copy uses `data-i18n` (`textContent`).
`fillDom` has no `[data-i18n-html]` path. i18next interpolation uses
`escapeValue: true`. `site.installLinux` is plain text in every locale
(`chmod +x`, `.deb`, `.rpm` stay readable). Download links were already
`textContent` / `createElement`.

**Was.** GitHub Pages (`website/`) set `el.innerHTML = i18next.t(key)`
for `[data-i18n-html]` (Linux install blurb with `<code>`). Catalogs
ship in-repo. A bad translation PR could inject script into
https://vcostin.github.io/tempura/ . Visitors cannot change those
JSON files.

**Evidence.** [`website/i18n.js`](../website/i18n.js) (`fillDom`, `escapeValue: true`);
[`website/index.html`](../website/index.html) `data-i18n="site.installLinux"`;
[`locales/en/ui.json`](../locales/en/ui.json) `site.installLinux`;
[`tests/unit/websiteI18n.test.ts`](../tests/unit/websiteI18n.test.ts).

#### L6 — macOS `open` / Windows `cmd` used to resolve via `PATH`

**Status.** Addressed. macOS uses `/usr/bin/open`. Windows uses
`%SYSTEMROOT%\System32\cmd.exe` (fallback `C:\Windows\System32\cmd.exe`).
The URL is still a separate `cmd` argument (`/C start "" <url>`), not
concatenated into a shell string. Linux was already absolute
(`/usr/bin/xdg-open`, `/usr/bin/gio`).

**Was.** macOS spawned `open` and Windows `cmd` via `PATH`.

**Evidence.** [`src-tauri/src/open_url.rs`](../src-tauri/src/open_url.rs)
`MACOS_OPEN`, `windows_cmd_exe`, `open_in_host_browser`.

#### L7 — Global shortcuts can take common combinations

**Status.** Open.

**Impact.** Settings accept any shortcut with Ctrl, Alt, or Super
(`hotkeys::check`), so `Control+KeyC` or `Control+KeyV` pass validation.
Registered globally, they stop copy or paste from reaching other apps on
X11, Windows, and macOS until the shortcut is cleared. A user can do this
by mistake; XSS could do it through `update_settings`. Presses only run
the three timer actions; no key or other app's input is sent to the
webview, so this is a nuisance, not a keylogger. Keys another app has
already registered are reported, never taken, but plain editing
shortcuts are usually not registered by anyone.

**Evidence.** [`src-tauri/src/hotkeys.rs`](../src-tauri/src/hotkeys.rs)
`check`, `on_shortcut`; [`src-tauri/src/models.rs`](../src-tauri/src/models.rs)
`AppSettings::validated`.

**Fix sketch.** Refuse the common editing and system combinations
(copy, paste, cut, undo, select all, save, quit, close, tab switching), or
require two modifiers, in `hotkeys::check`, with a Settings message that
says why.

#### L8 — Portal desktop entry: `Exec` quoting does not cover newlines

**Status.** Open (informational in practice).

**Impact.** When the user sets up Wayland shortcuts, Tempura writes a
hidden `app.tempura.focus.desktop` (and icon) under `~/.local/share` if
no system entry exists. `exec_argument` follows the Desktop Entry quoting
rules for `"`, `` ` ``, `$`, `\`, and `%`, but a newline in the path
would end the `Exec` line and could add keys. The path comes from
`$APPIMAGE` or the running executable, both set by the same user, so
there is no attacker in the middle; it is a correctness gap.

**Evidence.** [`src-tauri/src/portal.rs`](../src-tauri/src/portal.rs)
`ensure_desktop_entry`, `desktop_entry`, `exec_argument`.

**Fix sketch.** Refuse to write the entry (and report a portal problem)
when the command contains a control character.

### Info

These are easy to misread as stronger guarantees than they are.

- **“Pinned feedback URL”** — frontend constant and Rust opener are both
  Discussion #5; the command no longer takes a URL (L2 addressed).
- **Debug UI lock ≠ IPC lockdown** — five-click unlock still shows the
  Debug page in release; `debug_test_notification` is compiled out
  (L1 addressed). Other app commands remain available unless you ACL
  them.
- **Capabilities list plugins, not app commands.**
  [`src-tauri/capabilities/default.json`](../src-tauri/capabilities/default.json)
  is lean (no shell / fs / http / opener plugins). Custom
  `#[tauri::command]`s are still available to the `main` window unless
  you add command ACLs. That is Tauri’s default, not a hole in the
  JSON file.
- **CSP** is `script-src 'self'` plus `freezePrototype`.
  `style-src` includes `'unsafe-inline'` for React. `connect-src` is
  IPC only; GitHub is reached from Rust (updater), not from page JS.
- **Autostart + `updater:default` + `process:allow-restart`** are
  intentional. XSS can nag and relaunch; it cannot skip ed25519.
- **Session export** (`export_sessions`) is a Rust command, not the
  dialog or fs plugin: the webview passes only the format and the dialog
  title. Rust renders the rows and shows a native save dialog modal to
  the main window; the file goes where the user picks, and gets the
  format's extension if the chosen name has none. CSV text fields (labels
  and technique names) starting like a formula (`=`, `+`, `-`, `@`, tab,
  CR) are defused. XSS could open the dialog with a misleading title, but
  the contents are always session history.
- **Global shortcut and dialog plugins** are used from Rust only. Neither
  appears in [`capabilities/default.json`](../src-tauri/capabilities/default.json),
  so page JS cannot call them directly; it can only change the recorded
  shortcuts through `update_settings` (L7).
- **Portal files persist.** The hidden desktop entry and icon written for
  Wayland shortcuts (L8) stay in `~/.local/share` after uninstall. Only
  written once portal shortcuts are enabled in settings (by the user, or
  by XSS through `update_settings`). On portals too old to reconfigure,
  Tempura opens the desktop's own shortcuts page (`systemsettings` or
  `gnome-control-center`). Program names and arguments are fixed, but
  they are found through `PATH`, unlike the feedback opener's absolute
  paths (L6); `PATH` is the user's own, so this is consistency, not risk.
- **Hotkey report** includes the path Tempura was launched from (to show
  the command for system shortcuts). That is visible to page JS; it is
  the user's own path, not a secret.
- **Session accounting (0.5.1)** saves progress once a minute during
  focus and closes sessions a crash left open. Same database, same
  `0600` mode; no new data leaves the machine.
- **Notification plugin** is permission-grant only. Phase banners go
  through Rust (`notify.rs`), not `notification:allow-notify`.

## What’s already solid

Worth keeping; do not “fix” these into something weaker.

- **Lean capabilities** — events, window focus, notification
  permission, autostart, updater, relaunch. No shell, fs, http, or
  opener plugins in `Cargo.toml`; the dialog and global-shortcut plugins
  added since are driven from Rust only and are not granted to the page.
- **Global shortcuts are opt-in** — nothing is registered until the user
  records a key, every key needs a modifier, and keys another app owns
  are reported instead of taken. On Wayland the desktop's own portal
  dialog assigns them.
- **Parameterized SQL** throughout [`db.rs`](../src-tauri/src/db.rs);
  [`models.rs`](../src-tauri/src/models.rs) validates technique ids,
  durations, themes, locale, accent.
- **Updater pubkey pinned** in `tauri.conf.json`; Release workflow
  **fails** if `TAURI_SIGNING_PRIVATE_KEY` is missing; AppImage
  **strip then re-sign**; `latest.json` prefers that raw AppImage;
  `uploadUpdaterJson: false` so matrix legs cannot race `latest.json`;
  one job runs `build-updater-json.ts`.
- **Locks frozen** (`deno.lock`, `Cargo.lock`); Actions pinned by
  commit SHA in `.github/workflows/*`; `.gitignore` has
  `src-tauri/.keys/`; no private key files in the tree.
- **Opener** opens `FEEDBACK_URL` only (no IPC URL argument; no
  `window.open` fallback). Host binaries are absolute paths (Linux,
  macOS `/usr/bin/open`, Windows `System32\cmd.exe`).
- **Unix DB modes** — app-data dir `0700`, SQLite + WAL/SHM `0600` on open.
- **Linux opener** strips AppImage `APPDIR` prefixes so `xdg-open`
  uses host libs (availability fix, not a privilege drop).
- **Download site i18n** — locale strings go in via `textContent`;
  interpolated values are escaped. No `innerHTML` from catalogs.

## Recommended fix order

**M1**, **L2**, **L1**, **L4**, **L3**, **L6**, and **L5** are done (raw
AppImage in `latest.json`; feedback opener is Discussion #5 only; test
notification IPC is debug-only; no `window.open` fallback; Unix DB
modes; absolute opener binaries; Pages i18n is `textContent` only).
Remaining:

1. **L7** — refuse common editing/system combinations as global
   shortcuts (small code change in `hotkeys::check`).
2. **L8** — refuse control characters in the portal desktop entry's
   command (small code change in `portal.rs`).
3. **M2** — Authenticode / notarization. Backlog: it costs money for
   certificates and developer accounts, and is not planned for now. The
   README warns about SmartScreen and Gatekeeper on first open.

## Out of scope here

- Implementing the items above.
- Full dependency advisory dump (lockfiles + SHA-pinned Actions are
  the current control; re-check with `cargo audit` / GitHub’s
  dependency graph when you next bump crates).
- Cutting a release.
