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
  return { linux: "Linux", windows: "Windows", macos: "macOS", mobile: "desktop" }[os] ?? "your OS";
}

function archLabel(os, arch) {
  if (os === "macos" && arch === "arm64") return "Apple Silicon";
  if (os === "macos" && arch === "x64") return "Intel";
  if (arch === "arm64") return "ARM64";
  if (arch === "x64") return "x64";
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

function setFallback(message) {
  primary.href = RELEASES;
  primaryLabel.textContent = "See GitHub Releases";
  primaryMeta.textContent = "All platforms";
  statusEl.textContent = message;
}

try {
  const res = await fetch(API, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 404) {
    setFallback("First tagged build is still cooking. The page will pick it up from GitHub Releases.");
  } else if (!res.ok) {
    setFallback("Could not read GitHub just now. Releases are on GitHub.");
  } else {
    const release = await res.json();
    const tag = String(release.tag_name ?? "").replace(/^v/, "") || "0.1.0";
    versionLabel.textContent = tag;

    const assets = (release.assets ?? [])
      .map((asset) => {
        const info = classify(asset.name);
        return info ? { ...asset, info } : null;
      })
      .filter(Boolean);

    const os = detectOs();
    const chosen = os === "mobile" || os === "unknown" ? null : pickPrimary(assets, os);

    const sums = (release.assets ?? []).find((asset) => asset.name === "SHA256SUMS");
    if (sums) {
      const a = document.createElement("a");
      a.href = sums.browser_download_url;
      a.textContent = "SHA256SUMS";
      sumsLink.replaceChildren("Full checksum file: ", a);
      sumsLink.hidden = false;
    }

    if (chosen) {
      const arch = archLabel(chosen.info.os, chosen.info.arch);
      const hash = sha256(chosen);
      primary.href = chosen.browser_download_url;
      primaryLabel.textContent = `Download for ${osLabel(os)}`;
      primaryMeta.textContent = [chosen.info.kind, arch, formatBytes(chosen.size)]
        .filter(Boolean)
        .join(" · ");
      if (hash) {
        primary.title = `SHA-256 ${hash}`;
        shaValue.textContent = hash;
        shaLine.hidden = false;
      }
      statusEl.textContent = `Latest is v${tag}. Other platforms below.`;
    } else if (assets.length) {
      primary.href = release.html_url ?? RELEASES;
      primaryLabel.textContent = "Choose a platform";
      primaryMeta.textContent = `v${tag}`;
      statusEl.textContent =
        os === "mobile"
          ? "Tempura is a desktop app. Grab a build for the computer you work on."
          : `Latest is v${tag}. Pick a file below.`;
    } else {
      setFallback(`v${tag} is tagged, but installers have not finished uploading yet.`);
    }

    others.hidden = assets.length === 0;
    others.replaceChildren(
      ...assets.map((asset) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = asset.browser_download_url;
        const arch = archLabel(asset.info.os, asset.info.arch);
        const hash = sha256(asset);
        a.textContent = [osLabel(asset.info.os), asset.info.kind, arch].filter(Boolean).join(" · ");
        if (hash) a.title = `SHA-256 ${hash}`;
        li.append(a);
        return li;
      }),
    );
  }
} catch {
  setFallback("Could not reach GitHub. Use the releases page.");
}
