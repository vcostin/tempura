# Releasing Tempura

Tag flow (version bump, `v*` push) lives in the [README](../README.md#releasing). This page is the maintainer source of truth for **in-app updater signing**.

The updater talks only to GitHub Releases (`latest.json` + signed installers). There is no extra update server.

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
