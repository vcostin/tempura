# Releasing Tempura

Maintainer source of truth for cutting a desktop release and for **in-app updater signing**. Desktop trust model and audit notes: [security.md](security.md).

The updater talks only to GitHub Releases (`latest.json` + signed installers). There is no extra update server.

## Cut a release

### Smoke before tagging

Do this **before** `deno task version` / tag / push, so AppImage-only bugs show up here instead of after Release.

1. Run `deno task tauri:build:signed` (loads `src-tauri/.keys/tempura.key`, sets an empty updater password, unsets `TAURI_SIGNING_PRIVATE_KEY_PATH`). Or set `TAURI_SIGNING_PRIVATE_KEY` yourself and run `deno task tauri:build`. Open the AppImage in `src-tauri/target/release/bundle/appimage/`.
2. On that build: window paints (Wayland/WebKit), tray, About version, **Send feedback** (browser or copy/link fallback is fine). If prefs shipped, open Settings and start a short session.
3. Full in-app update still needs a published `latest.json` (previous install → new tag). Optionally confirm the local `.sig` matches after the wayland re-sign: `minisign -Vm path/to/*.AppImage -x path/to/*.AppImage.sig -p ~/.tauri/tempura.key.pub`.

Version lives in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`. Keep them in lockstep, then push a `v*` tag:

```bash
deno task version 0.2.0
git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "Release v0.2.0"
git tag v0.2.0
git push origin main --tags
```

GitHub Actions builds with Deno: Linux (AppImage + deb + rpm), Windows (MSI + NSIS), and macOS (Apple Silicon + Intel), then attaches them to the GitHub Release. The [download page](https://vcostin.github.io/tempura/) reads that release. `.sig` files go up with each platform; `latest.json` is written once after the matrix so the in-app updater sees every platform.

The first public tag is `v0.1.0`. Builds are unsigned for Authenticode / Gatekeeper, so Windows SmartScreen and macOS Gatekeeper may warn on first open.

### Release notes

Every `v*` tag creates a GitHub Release whose body includes:

1. The short installer / download-page blurb (static preamble in `.github/workflows/release.yml`)
2. GitHub’s auto-generated **What’s Changed** list (merged PRs since the previous tag)

This is already wired: `gh release create --generate-notes` in the create-release job, and `generateReleaseNotes: true` on tauri-action. Do not remove those flags. Optional hand-written highlights belong in the static preamble only — never replace the generated changelog.

[v0.2.1](https://github.com/vcostin/tempura/releases/tag/v0.2.1) and [v0.2.2](https://github.com/vcostin/tempura/releases/tag/v0.2.2) show the resulting page.

### Linux AppImage

Release and `deno task tauri:build` set `NO_STRIP=true` (linuxdeploy’s bundled `strip` breaks on modern ELF) and `APPIMAGE_EXTRACT_AND_RUN=1`. You may also need `fuse2`, `squashfs-tools`, and `patchelf`. After the Tauri CLI finishes, `scripts/tauri-ci.ts` drops bundled libwayland from AppImages so WebKit can use the host copy, then **re-signs** each AppImage so the `.sig` matches the rewritten bytes. Never upload an AppImage whose `.sig` was produced before that rewrite — that mismatch is why AppImage self-update was broken on v0.3.1. Stale `*.AppImage.tar.gz` (and `*.AppImage.tar.gz.sig`) from the pre-patch bundle are deleted; `latest.json` prefers the raw `.AppImage` even if a tarball is still listed.

Local `deno task tauri:build` also needs the updater private key in the environment (below).

## Signing (ed25519, not Authenticode)

Tauri verifies updates with an ed25519 keypair. That is **not** Windows Authenticode or Apple notarization. Installers stay unsigned for Authenticode / Gatekeeper for now; SmartScreen and Gatekeeper may still warn on first open. The updater signature is a separate check so the app only installs builds you signed.

Generate a keypair once and keep the private half **only** in GitHub Actions secrets (and a password manager). Never commit it.

```bash
deno task tauri signer generate -- -w ~/.tauri/tempura.key --ci
```

1. Put the contents of `tempura.key.pub` in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
2. Repo secret `TAURI_SIGNING_PRIVATE_KEY` = contents of the private key file.
3. Optional repo secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if you generated the key with a password.
4. Local `deno task tauri:build` needs the same private key in the environment (`TAURI_SIGNING_PRIVATE_KEY` or `TAURI_SIGNING_PRIVATE_KEY_PATH`).

`.github/workflows/release.yml` fails fast if `TAURI_SIGNING_PRIVATE_KEY` is missing, then passes both signing env vars into tauri-action.

Matrix jobs upload installers and `.sig` files only (`uploadUpdaterJson: false`). After they finish, one job writes `latest.json` via `scripts/build-updater-json.ts` so parallel legs cannot race on that file. Do not turn `uploadUpdaterJson` back on.

Losing the private key (or rotating the public key in an already-shipped build) means existing installs cannot verify future updates. Generate a new pair only if you are willing to break in-app updates for those builds.

## If you fork

A fork is a different app as far as the updater is concerned. Do not reuse this repo’s public key or expect `vcostin/tempura` releases to update your builds.

1. Generate **your own** keypair (command above).
2. Put **your** public key in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.
3. Add **your** private key as the GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY` on **your** repository (optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if you used a password).
4. Point the updater at **your** Releases JSON:

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/<you>/<repo>/releases/latest/download/latest.json"
    ]
  }
}
```

Until that secret is set, the Release workflow will fail on the “Require updater signing key” step — that is intentional.
