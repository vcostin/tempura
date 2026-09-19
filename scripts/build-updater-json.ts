/// <reference lib="deno.ns" />
/**
 * Synthesize Tauri `latest.json` from a GitHub Release’s assets.
 *
 * Matrix jobs must not upload this file (tauri-action’s merge races).
 * One job after the matrix runs this script, then `gh release upload --clobber`.
 *
 *   GH_TOKEN=… deno run -A ./scripts/build-updater-json.ts --out latest.json
 */

export const REQUIRED_PLATFORMS = [
  "linux-x86_64",
  "windows-x86_64",
  "darwin-x86_64",
  "darwin-aarch64",
] as const;

export type RequiredPlatform = (typeof REQUIRED_PLATFORMS)[number];

export type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  id?: number;
  url?: string;
};

export type PlatformFiles = {
  bundle: ReleaseAsset;
  sig: ReleaseAsset;
};

export type UpdaterJson = {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
};

export class MissingPlatformsError extends Error {
  readonly missing: readonly string[];
  constructor(missing: readonly string[]) {
    super(`latest.json missing platform(s): ${missing.join(", ")}`);
    this.name = "MissingPlatformsError";
    this.missing = missing;
  }
}

function isSig(name: string): boolean {
  return name.endsWith(".sig");
}

function pair(assets: readonly ReleaseAsset[], bundle: ReleaseAsset | undefined): PlatformFiles | undefined {
  if (!bundle) return undefined;
  const sig = assets.find((a) => a.name === `${bundle.name}.sig`);
  if (!sig) return undefined;
  return { bundle, sig };
}

function firstMatch(
  assets: readonly ReleaseAsset[],
  test: (name: string) => boolean,
): ReleaseAsset | undefined {
  return assets.find((a) => !isSig(a.name) && test(a.name));
}

function linuxRawAppImage(assets: readonly ReleaseAsset[]): PlatformFiles | undefined {
  return pair(assets, firstMatch(assets, (n) => n.endsWith(".AppImage")));
}

function linuxPackedAppImage(assets: readonly ReleaseAsset[]): PlatformFiles | undefined {
  return pair(assets, firstMatch(assets, (n) => n.endsWith(".AppImage.tar.gz")));
}

/** True when a Release lists both a raw AppImage pair and a packed tar.gz pair. */
export function linuxHasPackedAndRaw(assets: readonly ReleaseAsset[]): boolean {
  return Boolean(linuxRawAppImage(assets) && linuxPackedAppImage(assets));
}

/**
 * Prefer the raw AppImage (wayland-stripped and re-signed in `tauri-ci.ts`).
 * Packed `.AppImage.tar.gz` is fallback only. Ignore deb/rpm.
 */
export function pickLinux(assets: readonly ReleaseAsset[]): PlatformFiles | undefined {
  return linuxRawAppImage(assets) ?? linuxPackedAppImage(assets);
}

/** Prefer NSIS setup exe (matches `updaterJsonPreferNsis: true`); MSI is fallback only. */
export function pickWindows(assets: readonly ReleaseAsset[]): PlatformFiles | undefined {
  return (
    pair(assets, firstMatch(assets, (n) => n.endsWith("-setup.exe") || n.endsWith(".nsis.zip"))) ??
    pair(assets, firstMatch(assets, (n) => n.endsWith(".msi.zip") || n.endsWith(".msi")))
  );
}

export function pickDarwinAarch64(assets: readonly ReleaseAsset[]): PlatformFiles | undefined {
  return pair(assets, firstMatch(assets, (n) => /_aarch64\.app\.tar\.gz$/.test(n)));
}

export function pickDarwinX64(assets: readonly ReleaseAsset[]): PlatformFiles | undefined {
  return pair(
    assets,
    firstMatch(assets, (n) => /_x64\.app\.tar\.gz$/.test(n) || /_x86_64\.app\.tar\.gz$/.test(n)),
  );
}

export function pickPlatforms(assets: readonly ReleaseAsset[]): Partial<Record<RequiredPlatform, PlatformFiles>> {
  const picked: Partial<Record<RequiredPlatform, PlatformFiles>> = {};
  const linux = pickLinux(assets);
  const windows = pickWindows(assets);
  const darwinX64 = pickDarwinX64(assets);
  const darwinArm = pickDarwinAarch64(assets);
  if (linux) picked["linux-x86_64"] = linux;
  if (windows) picked["windows-x86_64"] = windows;
  if (darwinX64) picked["darwin-x86_64"] = darwinX64;
  if (darwinArm) picked["darwin-aarch64"] = darwinArm;
  return picked;
}

export function missingPlatforms(
  picked: Partial<Record<RequiredPlatform, PlatformFiles>>,
): RequiredPlatform[] {
  return REQUIRED_PLATFORMS.filter((key) => !picked[key]);
}

export function buildUpdaterJson(opts: {
  version: string;
  notes: string;
  pubDate: string;
  platforms: Record<string, { signature: string; url: string }>;
}): UpdaterJson {
  const missing = REQUIRED_PLATFORMS.filter((key) => !opts.platforms[key]);
  if (missing.length > 0) throw new MissingPlatformsError(missing);

  const platforms: UpdaterJson["platforms"] = {};
  for (const key of REQUIRED_PLATFORMS) {
    platforms[key] = opts.platforms[key];
  }
  return {
    version: opts.version.replace(/^v/, ""),
    notes: opts.notes,
    pub_date: opts.pubDate,
    platforms,
  };
}

function argValue(flag: string): string | undefined {
  const i = Deno.args.indexOf(flag);
  if (i === -1) return undefined;
  return Deno.args[i + 1];
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name)?.trim();
  if (!v) {
    console.error(`Missing ${name}`);
    Deno.exit(1);
  }
  return v;
}

async function githubJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`${url} → ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function githubText(url: string, token: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    throw new Error(`${url} → ${res.status} ${await res.text()}`);
  }
  return await res.text();
}

async function main(): Promise<void> {
  const token = Deno.env.get("GH_TOKEN")?.trim() || Deno.env.get("GITHUB_TOKEN")?.trim();
  if (!token) {
    console.error("Set GH_TOKEN or GITHUB_TOKEN");
    Deno.exit(1);
  }

  const repo = argValue("--repo") || requireEnv("GITHUB_REPOSITORY");
  const tag = (argValue("--tag") || requireEnv("GITHUB_REF_NAME")).replace(/^refs\/tags\//, "");
  const out = argValue("--out") || "latest.json";

  type GhRelease = {
    id: number;
    name: string | null;
    published_at: string | null;
    created_at: string;
    assets: ReleaseAsset[];
  };

  const release = await githubJson<GhRelease>(
    `https://api.github.com/repos/${repo}/releases/tags/${tag}`,
    token,
  );
  const assets = await githubJson<ReleaseAsset[]>(
    `https://api.github.com/repos/${repo}/releases/${release.id}/assets?per_page=100`,
    token,
  );

  if (linuxHasPackedAndRaw(assets)) {
    console.warn(
      "latest.json: both .AppImage and .AppImage.tar.gz are on this Release; using the raw .AppImage (re-signed after the Wayland strip).",
    );
  }

  const picked = pickPlatforms(assets);
  const missing = missingPlatforms(picked);
  if (missing.length > 0) {
    const names = assets.map((a) => a.name).join("\n  ");
    console.error(new MissingPlatformsError(missing).message);
    console.error(`Release assets:\n  ${names || "(none)"}`);
    Deno.exit(1);
  }

  const platforms: Record<string, { signature: string; url: string }> = {};
  for (const key of REQUIRED_PLATFORMS) {
    const files = picked[key]!;
    const sigApi = files.sig.url ??
      (files.sig.id != null
        ? `https://api.github.com/repos/${repo}/releases/assets/${files.sig.id}`
        : files.sig.browser_download_url);
    platforms[key] = {
      signature: await githubText(sigApi, token),
      url: files.bundle.browser_download_url,
    };
  }

  const json = buildUpdaterJson({
    version: tag.replace(/^v/, ""),
    notes: (release.name || `Tempura ${tag}`).trim(),
    pubDate: release.published_at || release.created_at,
    platforms,
  });

  const text = `${JSON.stringify(json, null, 2)}\n`;
  await Deno.writeTextFile(out, text);
  console.log(`Wrote ${out} for ${tag} (${REQUIRED_PLATFORMS.join(", ")})`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    Deno.exit(1);
  }
}
