/// <reference lib="deno.ns" />
import {
  buildUpdaterJson,
  linuxHasPackedAndRaw,
  MissingPlatformsError,
  pickPlatforms,
  type ReleaseAsset,
} from "../../scripts/build-updater-json.ts";

function asset(name: string): ReleaseAsset {
  return {
    name,
    browser_download_url: `https://github.com/vcostin/tempura/releases/download/v0.3.0/${name}`,
  };
}

/** Names from the v0.3.0 GitHub Release (installers + .sig sidecars). */
const V030: ReleaseAsset[] = [
  "Tempura-0.3.0-1.x86_64.rpm",
  "Tempura-0.3.0-1.x86_64.rpm.sig",
  "Tempura_0.3.0_aarch64.app.tar.gz",
  "Tempura_0.3.0_aarch64.app.tar.gz.sig",
  "Tempura_0.3.0_aarch64.dmg",
  "Tempura_0.3.0_amd64.AppImage",
  "Tempura_0.3.0_amd64.AppImage.sig",
  "Tempura_0.3.0_amd64.deb.sig",
  "Tempura_0.3.0_x64-setup.exe",
  "Tempura_0.3.0_x64-setup.exe.sig",
  "Tempura_0.3.0_x64.app.tar.gz",
  "Tempura_0.3.0_x64.app.tar.gz.sig",
  "Tempura_0.3.0_x64.dmg",
  "Tempura_0.3.0_x64_en-US.msi.sig",
].map(asset);

Deno.test("pickPlatforms: v0.3.0 names map to AppImage, NSIS, both macOS tarballs", () => {
  const picked = pickPlatforms(V030);
  const urls = {
    linux: picked["linux-x86_64"]?.bundle.name,
    windows: picked["windows-x86_64"]?.bundle.name,
    intel: picked["darwin-x86_64"]?.bundle.name,
    arm: picked["darwin-aarch64"]?.bundle.name,
  };
  if (urls.linux !== "Tempura_0.3.0_amd64.AppImage") throw new Error(`linux: ${urls.linux}`);
  if (urls.windows !== "Tempura_0.3.0_x64-setup.exe") throw new Error(`windows: ${urls.windows}`);
  if (urls.intel !== "Tempura_0.3.0_x64.app.tar.gz") throw new Error(`intel: ${urls.intel}`);
  if (urls.arm !== "Tempura_0.3.0_aarch64.app.tar.gz") throw new Error(`arm: ${urls.arm}`);
});

Deno.test("pickPlatforms: NSIS wins over MSI; AppImage wins over rpm", () => {
  const assets = [
    ...V030,
    asset("Tempura_0.3.0_x64_en-US.msi"),
    asset("Tempura_0.3.0_amd64.deb"),
  ];
  const picked = pickPlatforms(assets);
  if (picked["windows-x86_64"]?.bundle.name !== "Tempura_0.3.0_x64-setup.exe") {
    throw new Error("expected NSIS, not MSI");
  }
  if (picked["linux-x86_64"]?.bundle.name !== "Tempura_0.3.0_amd64.AppImage") {
    throw new Error("expected AppImage, not deb/rpm");
  }
});

Deno.test("pickPlatforms: bundle without .sig is not a platform", () => {
  const picked = pickPlatforms([
    asset("Tempura_0.3.0_amd64.AppImage"),
    asset("Tempura_0.3.0_x64-setup.exe"),
    asset("Tempura_0.3.0_x64-setup.exe.sig"),
    asset("Tempura_0.3.0_x64.app.tar.gz"),
    asset("Tempura_0.3.0_x64.app.tar.gz.sig"),
    asset("Tempura_0.3.0_aarch64.app.tar.gz"),
    asset("Tempura_0.3.0_aarch64.app.tar.gz.sig"),
  ]);
  if (picked["linux-x86_64"]) throw new Error("AppImage without .sig must not count");
  if (!picked["windows-x86_64"] || !picked["darwin-x86_64"] || !picked["darwin-aarch64"]) {
    throw new Error("other platforms should still pair");
  }
});

Deno.test("pickPlatforms: raw AppImage beats packed tar.gz", () => {
  const both = [
    asset("Tempura_0.3.0_amd64.AppImage"),
    asset("Tempura_0.3.0_amd64.AppImage.sig"),
    asset("Tempura_0.3.0_amd64.AppImage.tar.gz"),
    asset("Tempura_0.3.0_amd64.AppImage.tar.gz.sig"),
  ];
  if (!linuxHasPackedAndRaw(both)) throw new Error("expected dual linux assets");
  const picked = pickPlatforms(both);
  if (picked["linux-x86_64"]?.bundle.name !== "Tempura_0.3.0_amd64.AppImage") {
    throw new Error(picked["linux-x86_64"]?.bundle.name ?? "missing linux");
  }
});

Deno.test("pickPlatforms: packed AppImage.tar.gz is fallback when raw is absent", () => {
  const picked = pickPlatforms([
    asset("Tempura_0.3.0_amd64.AppImage.tar.gz"),
    asset("Tempura_0.3.0_amd64.AppImage.tar.gz.sig"),
  ]);
  if (linuxHasPackedAndRaw([
    asset("Tempura_0.3.0_amd64.AppImage.tar.gz"),
    asset("Tempura_0.3.0_amd64.AppImage.tar.gz.sig"),
  ])) {
    throw new Error("tar.gz-only is not dual");
  }
  if (picked["linux-x86_64"]?.bundle.name !== "Tempura_0.3.0_amd64.AppImage.tar.gz") {
    throw new Error(picked["linux-x86_64"]?.bundle.name ?? "missing linux");
  }
});

Deno.test("pickPlatforms: dmg is not a darwin updater artifact", () => {
  const dmgOnly = [
    asset("Tempura_0.3.0_aarch64.dmg"),
    asset("Tempura_0.3.0_aarch64.dmg.sig"),
    asset("Tempura_0.3.0_x64.dmg"),
    asset("Tempura_0.3.0_x64.dmg.sig"),
  ];
  const picked = pickPlatforms(dmgOnly);
  if (picked["darwin-aarch64"] || picked["darwin-x86_64"]) {
    throw new Error("dmg must not fill darwin keys");
  }
});

Deno.test("buildUpdaterJson: requires all four platform keys", () => {
  const platforms = {
    "linux-x86_64": { signature: "sig-linux", url: "https://example/linux" },
    "windows-x86_64": { signature: "sig-win", url: "https://example/win" },
    "darwin-x86_64": { signature: "sig-intel", url: "https://example/intel" },
    "darwin-aarch64": { signature: "sig-arm", url: "https://example/arm" },
  };
  const json = buildUpdaterJson({
    version: "v0.3.0",
    notes: "Tempura v0.3.0",
    pubDate: "2026-09-17T19:25:44Z",
    platforms,
  });
  if (json.version !== "0.3.0") throw new Error(json.version);
  if (Object.keys(json.platforms).join(",") !== "linux-x86_64,windows-x86_64,darwin-x86_64,darwin-aarch64") {
    throw new Error("platform key order");
  }

  try {
    buildUpdaterJson({
      version: "0.3.0",
      notes: "n",
      pubDate: "2026-09-17T19:25:44Z",
      platforms: { "linux-x86_64": platforms["linux-x86_64"] },
    });
    throw new Error("expected throw");
  } catch (err) {
    if (!(err instanceof MissingPlatformsError)) throw err;
    if (!err.missing.includes("windows-x86_64") || !err.missing.includes("darwin-aarch64")) {
      throw new Error(`missing list: ${err.missing.join(",")}`);
    }
  }
});
