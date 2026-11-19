// Runtime for the prerendered pages: the language switcher and the download button.
// Copy is already in the HTML; the few strings needed here come from #site-data and are
// only ever assigned with textContent (security.md L5).

const REPO = "vcostin/tempura";
const RELEASES = `https://github.com/${REPO}/releases/latest`;
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const STORAGE_KEY = "tempura-locale";

const data = JSON.parse(document.getElementById("site-data")?.textContent || "{}");
const strings = data.strings ?? {};

/** @param {string} key @param {Record<string, string>} [vars] */
function t(key, vars = {}) {
  return String(strings[key] ?? key).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, v) => vars[v] ?? "");
}

/* ---------- Language switcher ---------- */

function remember(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage blocked: the URL still carries the language */
  }
}

/** Size the closed select to its label so the chevron sits next to the text. */
function fitLangSelect(select) {
  if (!select?.selectedOptions?.[0] || CSS.supports?.("field-sizing", "content")) return;
  const cs = getComputedStyle(select);
  const probe = document.createElement("span");
  probe.textContent = select.selectedOptions[0].textContent ?? "";
  probe.style.cssText = [
    "position:absolute",
    "inset-inline-start:0",
    "top:0",
    "visibility:hidden",
    "pointer-events:none",
    "white-space:nowrap",
    `font:${cs.font}`,
    `letter-spacing:${cs.letterSpacing}`,
  ].join(";");
  document.body.append(probe);
  const pad = (Number.parseFloat(cs.paddingInlineStart) || 0) + (Number.parseFloat(cs.paddingInlineEnd) || 0);
  const border = (Number.parseFloat(cs.borderLeftWidth) || 0) + (Number.parseFloat(cs.borderRightWidth) || 0);
  select.style.width = `${Math.ceil(probe.getBoundingClientRect().width + pad + border + 1)}px`;
  probe.remove();
}

const langSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById("lang-select"));
if (langSelect) {
  fitLangSelect(langSelect);
  void document.fonts?.ready.then(() => fitLangSelect(langSelect));
  langSelect.addEventListener("change", () => {
    const opt = langSelect.selectedOptions[0];
    if (!opt) return;
    remember(opt.dataset.locale ?? "");
    location.href = opt.value + location.hash;
  });
}
for (const a of document.querySelectorAll(".foot-langs a[data-locale]")) {
  a.addEventListener("click", () => remember(a.getAttribute("data-locale") ?? ""));
}

/* ---------- Download button ---------- */

const SKIP = /\.(sig|json|tar\.gz)$/i; // updater sidecars: .sig, latest.json, macOS .app.tar.gz

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
  if (n.endsWith(".appimage")) return { os: "linux", kind: "AppImage", arch: archOf(n), primary: true };
  if (n.endsWith(".deb")) return { os: "linux", kind: ".deb", arch: archOf(n) };
  if (n.endsWith(".rpm")) return { os: "linux", kind: ".rpm", arch: archOf(n) };
  if (n.endsWith(".msi")) return { os: "windows", kind: "MSI", arch: archOf(n), primary: true };
  if (n.endsWith(".exe")) return { os: "windows", kind: "Installer", arch: archOf(n) };
  if (n.endsWith(".dmg")) return { os: "macos", kind: "DMG", arch: archOf(n), primary: true };
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
  return t(key ?? "osUnknown");
}

function archLabel(os, arch) {
  if (os === "macos" && arch === "arm64") return t("archAppleSilicon");
  if (os === "macos" && arch === "x64") return t("archIntel");
  if (arch === "arm64") return t("archArm64");
  if (arch === "x64") return t("archX64");
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
const eyebrow = document.getElementById("eyebrow");
const shaLine = document.getElementById("sha-line");
const shaValue = document.getElementById("sha-value");
const sumsLink = document.getElementById("sums-link");

function fallback(statusKey, vars) {
  primary.href = RELEASES;
  primaryLabel.textContent = t("seeReleases");
  primaryMeta.textContent = t("allPlatforms");
  statusEl.textContent = t(statusKey, vars);
}

async function paintDownloads() {
  let res;
  try {
    res = await fetch(API, { headers: { Accept: "application/vnd.github+json" } });
  } catch {
    return fallback("couldNotReach");
  }
  if (res.status === 404) return fallback("firstBuildCooking");
  if (!res.ok) return fallback("couldNotRead");

  let release;
  try {
    release = await res.json();
  } catch {
    return fallback("couldNotRead");
  }
  const tag = String(release.tag_name ?? "").replace(/^v/, "");
  if (tag && eyebrow) eyebrow.textContent = t("eyebrow", { version: tag });

  const assets = (release.assets ?? [])
    .map((asset) => {
      const info = classify(String(asset.name ?? ""));
      return info ? { ...asset, info } : null;
    })
    .filter(Boolean);
  if (!assets.length) return fallback("taggedWaiting", { tag });

  const os = detectOs();
  const chosen = os === "mobile" || os === "unknown" ? null : pickPrimary(assets, os);
  const sums = (release.assets ?? []).find((asset) => asset.name === "SHA256SUMS");

  if (sums?.browser_download_url) {
    const a = document.createElement("a");
    a.href = sums.browser_download_url;
    a.textContent = "SHA256SUMS";
    sumsLink.replaceChildren(t("checksumFile"), a);
    sumsLink.hidden = false;
  }

  if (chosen) {
    const hash = sha256(chosen);
    primary.href = chosen.browser_download_url;
    primaryLabel.textContent = t("downloadFor", { os: osLabel(os) });
    primaryMeta.textContent = [chosen.info.kind, archLabel(chosen.info.os, chosen.info.arch), formatBytes(chosen.size)]
      .filter(Boolean)
      .join(" · ");
    if (hash) {
      primary.title = t("shaTitle", { hash });
      shaValue.textContent = hash;
      shaLine.hidden = false;
    }
    statusEl.textContent = t("latestOther", { tag });
  } else {
    primary.href = release.html_url ?? RELEASES;
    primaryLabel.textContent = t("choosePlatform");
    primaryMeta.textContent = `v${tag}`;
    statusEl.textContent = os === "mobile" ? t("desktopOnly") : t("latestPick", { tag });
  }

  others.replaceChildren(
    ...assets.map((asset) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = asset.browser_download_url;
      a.textContent = [osLabel(asset.info.os), asset.info.kind, archLabel(asset.info.os, asset.info.arch)]
        .filter(Boolean)
        .join(" · ");
      const hash = sha256(asset);
      if (hash) a.title = t("shaTitle", { hash });
      li.append(a);
      return li;
    }),
  );
  others.hidden = false;
}

if (primary && primaryLabel && primaryMeta && statusEl && others && shaLine && shaValue && sumsLink) {
  void paintDownloads();
}
