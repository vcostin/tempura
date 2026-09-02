import { refresh, t, whenReady } from "./i18n.js";

const REPO = "vcostin/tempura";
const RELEASES = `https://github.com/${REPO}/releases/latest`;
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

const SKIP = /\.(sig|json|tar\.gz)$/i;

/**
 * @typedef {{ os: 'linux' | 'windows' | 'macos', kind: string, arch: string, primary?: boolean }} Classified
 */

/** @param {string} name */
function archOf(name) {
  const n = name.toLowerCase();
  if (/aarch64|arm64/.test(n)) return "arm64";
  if (/x64|x86_64|amd64/.test(n)) return "x64";
  if (/arm/.test(n)) return "arm";
  return "";
}

/** @param {string} name */
function classify(name) {
  const n = name.toLowerCase();
  if (SKIP.test(n)) return null;
  if (n.endsWith(".appimage")) {
    return { os: "linux", kind: "AppImage", arch: archOf(n), primary: true };
  }
  if (n.endsWith(".deb")) return { os: "linux", kind: ".deb", arch: archOf(n) };
  if (n.endsWith(".rpm")) return { os: "linux", kind: ".rpm", arch: archOf(n) };
  if (n.endsWith(".msi")) {
    return { os: "windows", kind: "MSI", arch: archOf(n), primary: true };
  }
  if (n.endsWith(".exe")) return { os: "windows", kind: "Installer", arch: archOf(n) };
  if (n.endsWith(".dmg")) {
    return { os: "macos", kind: "DMG", arch: archOf(n), primary: true };
  }
  return null;
}

function detectOs() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Android/i.test(ua)) return "mobile";
  if (/Win/i.test(navigator.platform) || /Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(navigator.platform) || /Mac OS|Macintosh/i.test(ua)) return "macos";
  if (/Linux/i.test(navigator.platform) || /Linux/i.test(ua)) return "linux";
  return "unknown";
}

function osLabel(os) {
  const key = { linux: "osLinux", windows: "osWindows", macos: "osMacos", mobile: "osMobile" }[os];
  return key ? t(`site.${key}`) : t("site.osUnknown");
}

function archLabel(os, arch) {
  if (os === "macos" && arch === "arm64") return t("site.archAppleSilicon");
  if (os === "macos" && arch === "x64") return t("site.archIntel");
  if (arch === "arm64") return t("site.archArm64");
  if (arch === "x64") return t("site.archX64");
  return arch;
}

function pickPrimary(assets, os) {
  const mine = assets.filter((a) => a.info.os === os);
  if (!mine.length) return null;
  if (os === "macos") {
    return mine.find((a) => a.info.arch === "arm64") ?? mine.find((a) => a.info.primary) ?? mine[0];
  }
  return mine.find((a) => a.info.primary) ?? mine[0];
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return "";
  const mb = n / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

/** @param {{ digest?: string }} asset */
function sha256(asset) {
  const digest = String(asset.digest ?? "");
  return digest.startsWith("sha256:") ? digest.slice(7) : "";
}

const primary = document.getElementById("primary-download");
const primaryLabel = document.getElementById("primary-label");
const primaryMeta = document.getElementById("primary-meta");
const statusEl = document.getElementById("cta-status");
const others = document.getElementById("other-downloads");
const versionLabel = document.getElementById("version-label");
const shaLine = document.getElementById("sha-line");
const shaValue = document.getElementById("sha-value");
const sumsLink = document.getElementById("sums-link");

/** @type {null | { kind: string, tag?: string, os?: string, assets?: object[], releaseUrl?: string, sumsUrl?: string, chosen?: object }} */
let paintState = null;

function setFallback(kind, tag) {
  paintState = { kind, tag };
  paint();
}

function paint() {
  if (!paintState) return;
  const { kind, tag, os, assets, releaseUrl, sumsUrl, chosen } = paintState;

  if (kind === "see-releases") {
    primary.href = RELEASES;
    primaryLabel.textContent = t("site.seeReleases");
    primaryMeta.textContent = t("site.allPlatforms");
    statusEl.textContent = t("site.couldNotReach");
    return;
  }
  if (kind === "cooking") {
    primary.href = RELEASES;
    primaryLabel.textContent = t("site.seeReleases");
    primaryMeta.textContent = t("site.allPlatforms");
    statusEl.textContent = t("site.firstBuildCooking");
    return;
  }
  if (kind === "github-fail") {
    primary.href = RELEASES;
    primaryLabel.textContent = t("site.seeReleases");
    primaryMeta.textContent = t("site.allPlatforms");
    statusEl.textContent = t("site.couldNotRead");
    return;
  }
  if (kind === "waiting") {
    primary.href = RELEASES;
    primaryLabel.textContent = t("site.seeReleases");
    primaryMeta.textContent = t("site.allPlatforms");
    statusEl.textContent = t("site.taggedWaiting", { tag });
    return;
  }

  if (sumsUrl) {
    const a = document.createElement("a");
    a.href = sumsUrl;
    a.textContent = "SHA256SUMS";
    sumsLink.replaceChildren(t("site.checksumFile"), a);
    sumsLink.hidden = false;
  }

  if (kind === "chosen" && chosen) {
    const arch = archLabel(chosen.info.os, chosen.info.arch);
    const hash = sha256(chosen);
    primary.href = chosen.browser_download_url;
    primaryLabel.textContent = t("site.downloadFor", { os: osLabel(os) });
    primaryMeta.textContent = [chosen.info.kind, arch, formatBytes(chosen.size)]
      .filter(Boolean)
      .join(" · ");
    if (hash) {
      primary.title = t("site.shaTitle", { hash });
      shaValue.textContent = hash;
      shaLine.hidden = false;
    }
    statusEl.textContent = t("site.latestOther", { tag });
  } else if (kind === "pick") {
    primary.href = releaseUrl ?? RELEASES;
    primaryLabel.textContent = t("site.choosePlatform");
    primaryMeta.textContent = `v${tag}`;
    statusEl.textContent =
      os === "mobile" ? t("site.desktopOnly") : t("site.latestPick", { tag });
  }

  if (assets) {
    others.hidden = assets.length === 0;
    others.replaceChildren(
      ...assets.map((asset) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = asset.browser_download_url;
        const arch = archLabel(asset.info.os, asset.info.arch);
        const hash = sha256(asset);
        a.textContent = [osLabel(asset.info.os), asset.info.kind, arch].filter(Boolean).join(" · ");
        if (hash) a.title = t("site.shaTitle", { hash });
        li.append(a);
        return li;
      }),
    );
  }
}

await whenReady;

document.addEventListener("tempura:locale", () => {
  refresh();
  paint();
});

try {
  const res = await fetch(API, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 404) {
    setFallback("cooking");
  } else if (!res.ok) {
    setFallback("github-fail");
  } else {
    const release = await res.json();
    const tag = String(release.tag_name ?? "").replace(/^v/, "") || "0.1.0";
    versionLabel.textContent = tag;
    refresh();

    const assets = (release.assets ?? [])
      .map((asset) => {
        const info = classify(asset.name);
        return info ? { ...asset, info } : null;
      })
      .filter(Boolean);

    const os = detectOs();
    const chosen = os === "mobile" || os === "unknown" ? null : pickPrimary(assets, os);
    const sums = (release.assets ?? []).find((asset) => asset.name === "SHA256SUMS");

    if (chosen) {
      paintState = {
        kind: "chosen",
        tag,
        os,
        assets,
        chosen,
        sumsUrl: sums?.browser_download_url,
      };
    } else if (assets.length) {
      paintState = {
        kind: "pick",
        tag,
        os,
        assets,
        releaseUrl: release.html_url ?? RELEASES,
        sumsUrl: sums?.browser_download_url,
      };
    } else {
      paintState = { kind: "waiting", tag };
    }
    paint();
  }
} catch {
  setFallback("see-releases");
}
