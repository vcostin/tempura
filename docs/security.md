# Security

Maintainer notes on what the Tempura desktop binary can do, and what a
read-only pass of the Tauri/Rust surface actually found.

This is not a pentest, not a CVE scrape, and not a list of enterprise
threats that do not apply. Tempura is a local-first focus timer: no
accounts, no telemetry, no extra update server. Host access is real
(tray, notifications, autostart, SQLite, GitHub Releases updater).

| | |
| --- | --- |
| **App version** | 0.3.2 |
| **Tree** | `a46d817` (`main` as of 2026-09-19; findings first noted around `d78d7f2`) |
| **Scope** | Tauri 2 config, Rust commands, opener, SQLite, updater CI, download site |
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
| Locale catalogs are maintainer-trusted | The download site injects a few translation strings as HTML. A malicious locale PR is the threat, not a random visitor. |

**XSS blast radius (if someone ever got script in the webview):**
autostart on/off, updater check/install (still needs a valid ed25519
sig), relaunch, quit, timer/settings/stats, a test notification, open
the pinned GitHub discussion. That is annoying, not “unsigned
update.”

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

#### L1 — `debug_test_notification` is always registered

**Impact.** The Debug page is a UI gate (`localStorage` + five version
clicks in About). The Rust command is on the invoke handler in every
build. Anyone who can call IPC (including XSS) can fire one OS
notification with a fixed title/body. Not a data leak.

**Evidence.** [`src-tauri/src/commands.rs`](../src-tauri/src/commands.rs) (`debug_test_notification`);
[`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) (always in `generate_handler!`);
[`src/lib/debugAccess.ts`](../src/lib/debugAccess.ts).

**Fix sketch.** `#[cfg(debug_assertions)]` the command, or add a Tauri
ACL that omits it from release capabilities. UI hiding is not IPC
lockdown.

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

#### L3 — SQLite created without `0700` / `0600`

**Impact.** `Database::open` does `create_dir_all` on the app-data
parent and opens `tempura.db` with default umask (often `0755` / `0644`).
On a shared Unix machine, another local user who can read that path can
read presets, “working on”, and session history. Same-user malware
already has the same view.

**Evidence.** [`src-tauri/src/db.rs`](../src-tauri/src/db.rs) `Database::open`;
[`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) `app_data_dir().join("tempura.db")`.

**Fix sketch.** After creating the directory and opening the file, set
`0o700` / `0o600` on Unix. Windows ACL tightening is optional and
noisier.

#### L4 — `window.open` fallback; no navigation deny-list

**Impact.** If the Rust opener fails, the UI tries
`window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer")`. There is
no `on_navigation` handler. CSP `default-src 'self'` is the main
brake on loading a remote page **in** the webview; it is not a hard
deny of new windows / opener behavior.

**Evidence.** [`src/lib/platform.ts`](../src/lib/platform.ts) `openFeedback`;
[`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs) (no navigation hook);
CSP in [`src-tauri/tauri.conf.json`](../src-tauri/tauri.conf.json).

**Fix sketch.** On opener failure, show the URL to copy (About already
does) and skip `window.open`. Optionally `on_navigation` → deny
anything that is not the app origin.

#### L5 — Download site `innerHTML` from locale strings

**Impact.** GitHub Pages (`website/`) sets `el.innerHTML = i18next.t(key)`
for `[data-i18n-html]` (Linux install blurb with `<code>`). Catalogs
ship in-repo. A bad translation PR could inject script into
https://vcostin.github.io/tempura/ . Visitors cannot change those
JSON files. Download links themselves are built with `textContent` /
`createElement`.

**Evidence.** [`website/i18n.js`](../website/i18n.js) (`fillDom`, `escapeValue: false`);
[`website/index.html`](../website/index.html) `data-i18n-html="site.installLinux"`;
[`locales/en/ui.json`](../locales/en/ui.json) `site.installLinux`.

**Fix sketch.** Keep `<code>` in the HTML template; put only plain text
in locales (`textContent`). Or sanitize to a tiny allowlist (`code`,
`em`).

#### L6 — macOS `open` / Windows `cmd` resolved via `PATH`

**Impact.** Linux uses `/usr/bin/xdg-open` then `/usr/bin/gio`. macOS
spawns `open`, Windows `cmd /C start "" <url>`. A poisoned `PATH` on
those two OSes could wrap the opener. For a desktop app running as the
user, `PATH` hijacking is usually already game-over; Linux being
absolute is the better pattern.

**Evidence.** [`src-tauri/src/open_url.rs`](../src-tauri/src/open_url.rs) `open_in_host_browser` / `open_linux`.

**Fix sketch.** Absolute paths where stable (`/usr/bin/open` is not
macOS’s layout; `C:\Windows\System32\cmd.exe` is). Do not pass the URL
through a shell on Windows beyond `cmd /C start` (already no extra
concatenation).

### Info

These are easy to misread as stronger guarantees than they are.

- **“Pinned feedback URL”** — frontend constant and Rust opener are both
  Discussion #5; the command no longer takes a URL (L2 addressed).
- **Debug UI lock ≠ IPC lockdown** — L1.
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
- **Notification plugin** is permission-grant only. Phase banners go
  through Rust (`notify.rs`), not `notification:allow-notify`.

## What’s already solid

Worth keeping; do not “fix” these into something weaker.

- **Lean capabilities** — events, window focus, notification
  permission, autostart, updater, relaunch. No shell, fs, http, or
  opener plugins in `Cargo.toml` either.
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
- **Opener** opens `FEEDBACK_URL` only (no IPC URL argument).
- **Linux opener** strips AppImage `APPDIR` prefixes so `xdg-open`
  uses host libs (availability fix, not a privilege drop).

## Recommended fix order

**M1** and **L2** are done (raw AppImage in `latest.json`; feedback
opener is Discussion #5 only). Remaining:

1. **L1** — Do not register `debug_test_notification` in release, or
   ACL it off.
2. **L4** — Copy/link fallback only; no `window.open`.
3. **L3** — Restrictive Unix modes on the app-data dir and DB.
4. **L6** — Absolute opener binaries where the OS has a stable path.
5. **L5** — Stop `innerHTML` for locale strings on the download site.
6. **M2** — Authenticode / notarization when you are ready to operate
   those programs (cert/account work, not a weekend patch).

## Out of scope here

- Implementing the items above.
- Full dependency advisory dump (lockfiles + SHA-pinned Actions are
  the current control; re-check with `cargo audit` / GitHub’s
  dependency graph when you next bump crates).
- Cutting a release.
