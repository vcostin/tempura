/// <reference lib="deno.ns" />
/**
 * Run the Tauri CLI.
 *
 *   deno task tauri build
 *
 * On Linux `build`, drop bundled libwayland from AppImages, then re-sign so the
 * updater `.sig` matches the rewritten file. `dev` / `signer` skip that post-process.
 * When the first arg is `dev`, clear leftover Tempura Vite on 1420 first.
 */

import { freeDevPort } from "./free-dev-port.ts";

export function isLinuxAppImagePostProcess(
  args: string[],
  os: typeof Deno.build.os = Deno.build.os,
): boolean {
  return os === "linux" && args[0] === "build";
}

export function appImageSearchDirs(repoRoot: string): string[] {
  const target = `${repoRoot}/src-tauri/target`;
  const dirs = [
    `${target}/release/bundle/appimage`,
    `${target}/debug/bundle/appimage`,
  ];
  try {
    for (const entry of Deno.readDirSync(target)) {
      if (!entry.isDirectory) continue;
      dirs.push(`${target}/${entry.name}/release/bundle/appimage`);
    }
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err;
  }
  return dirs;
}

export async function findAppImages(repoRoot: string): Promise<string[]> {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const dir of appImageSearchDirs(repoRoot)) {
    let entries: Deno.DirEntry[];
    try {
      entries = [];
      for await (const entry of Deno.readDir(dir)) entries.push(entry);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) continue;
      throw err;
    }
    for (const entry of entries) {
      if (!entry.isFile) continue;
      if (!entry.name.toLowerCase().endsWith(".appimage")) continue;
      const path = `${dir}/${entry.name}`;
      if (seen.has(path)) continue;
      seen.add(path);
      found.push(path);
    }
  }
  found.sort();
  return found;
}

export function staleAppImageTarPaths(appImagePath: string): string[] {
  return [`${appImagePath}.tar.gz`, `${appImagePath}.tar.gz.sig`];
}

export function hasUpdaterSigningKey(
  env: { get(key: string): string | undefined } = Deno.env,
): boolean {
  const key = env.get("TAURI_SIGNING_PRIVATE_KEY")?.trim();
  const path = env.get("TAURI_SIGNING_PRIVATE_KEY_PATH")?.trim();
  return Boolean(key) || Boolean(path);
}

export async function removeStaleAppImageTarballs(appImagePath: string): Promise<string[]> {
  const removed: string[] = [];
  for (const path of staleAppImageTarPaths(appImagePath)) {
    try {
      await Deno.remove(path);
      removed.push(path);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) continue;
      throw err;
    }
  }
  return removed;
}

async function runTauriCli(args: string[]): Promise<number> {
  const cli = new Deno.Command("deno", {
    args: ["run", "-A", "--node-modules-dir", "npm:@tauri-apps/cli", ...args],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await cli.output();
  return code;
}

async function signArtifact(path: string): Promise<void> {
  const code = await runTauriCli(["signer", "sign", path]);
  if (code !== 0) {
    console.error(`tauri-ci: failed to re-sign ${path}`);
    Deno.exit(code);
  }
}

async function patchAppImages(): Promise<number> {
  const script = new URL("./appimage-use-host-wayland.sh", import.meta.url);
  const patch = new Deno.Command("bash", {
    args: [script.pathname],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await patch.output();
  return code;
}

export function repoRootFromScript(): string {
  return new URL("..", import.meta.url).pathname.replace(/\/$/, "");
}

export async function resignPatchedAppImages(repoRoot: string): Promise<void> {
  const images = await findAppImages(repoRoot);
  if (images.length === 0) {
    console.log("tauri-ci: no AppImages to re-sign");
    return;
  }
  if (!hasUpdaterSigningKey()) {
    console.error(
      "tauri-ci: AppImage post-process needs a re-sign. Set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH.",
    );
    Deno.exit(1);
  }
  for (const image of images) {
    const stale = await removeStaleAppImageTarballs(image);
    for (const path of stale) {
      console.log(`tauri-ci: removed stale ${path}`);
    }
    console.log(`tauri-ci: re-signing ${image}`);
    await signArtifact(image);
  }
}

async function main(): Promise<void> {
  if (Deno.args[0] === "dev") {
    await freeDevPort({ quietIfFree: true });
  }

  const code = await runTauriCli(Deno.args);
  if (code !== 0) Deno.exit(code);

  if (!isLinuxAppImagePostProcess(Deno.args)) {
    Deno.exit(0);
  }

  const patched = await patchAppImages();
  if (patched !== 0) Deno.exit(patched);

  await resignPatchedAppImages(repoRootFromScript());
}

if (import.meta.main) {
  await main();
}
