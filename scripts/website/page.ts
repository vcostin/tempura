/**
 * The download site's page, rendered once per locale at build time (scripts/build-website.ts).
 *
 * Every locale string goes through `esc()` — catalogs are maintainer-trusted, but a
 * locale PR may change copy, never markup (security.md L5).
 */

export const ORIGIN = "https://vcostin.github.io/tempura/";
export const REPO_URL = "https://github.com/vcostin/tempura";
export const RELEASES_URL = `${REPO_URL}/releases`;
export const LATEST_URL = `${RELEASES_URL}/latest`;

export type Dir = "ltr" | "rtl";
export interface LocaleMeta {
  code: string;
  name: string;
  nativeName: string;
  dir: Dir;
}
type Dict = { [key: string]: string | Dict };
export interface Catalog {
  meta: LocaleMeta;
  ui: Dict;
  techniques: Record<string, { name: string; workBreak: string; bestFor: string; blurb: string }>;
}

/** URL path segment for a locale; English is the site root (and x-default). */
export function localeSlug(code: string): string {
  return code === "en" ? "" : `${code.toLowerCase()}/`;
}

export function localeUrl(code: string): string {
  return ORIGIN + localeSlug(code);
}

export function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** JSON inside <script> data blocks: never let a string close the element. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

export async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  let bin = "";
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Built-in rhythms as seeded in src-tauri/src/db.rs (minutes); drawn as one full set. */
const RHYTHMS: Record<string, { focus: number; short: number; long: number; cycles: number } | "flow" | "hybrid" | "custom"> = {
  classic: { focus: 25, short: 5, long: 15, cycles: 4 },
  sprint: { focus: 15, short: 3, long: 15, cycles: 4 },
  deep: { focus: 50, short: 10, long: 20, cycles: 3 },
  "fifty-two-seventeen": { focus: 52, short: 17, long: 30, cycles: 2 },
  ultradian: { focus: 90, short: 20, long: 30, cycles: 2 },
  flowtime: "flow",
  hybrid: "hybrid",
  custom: "custom",
};
export const TECHNIQUE_IDS = Object.keys(RHYTHMS);

/** Files every locale needs under website/shots/<code>/ (checked in CI by websiteI18n.test.ts). */
export const SHOT_NAMES = ["timer", "techniques", "stats"] as const;
export const SHOT_FILES = [...SHOT_NAMES.map((n) => `${n}.webp`), "og.jpg"];

/** The longest built-in set (Ultradian: 2 × 90 + 20 + 30 min) fills the bar. */
const SCALE_MIN = 230;
const BAR_W = 300;
const BAR_H = 14;
const GAP = 2;

function rhythmBar(id: string): string {
  const r = RHYTHMS[id];
  type Seg = [kind: "focus" | "break" | "long" | "flow" | "open", minutes: number];
  let segs: Seg[];
  if (r === "flow") segs = [["flow", 115], ["break", 23]];
  else if (r === "hybrid") segs = [["focus", 25], ["flow", 55], ["break", 16]];
  else if (r === "custom") segs = [["open", 40], ["open", 8], ["open", 40], ["open", 8], ["open", 40], ["open", 20]];
  else {
    segs = [];
    for (let i = 0; i < r.cycles; i++) {
      segs.push(["focus", r.focus]);
      segs.push(i === r.cycles - 1 ? ["long", r.long] : ["break", r.short]);
    }
  }
  let x = 0;
  const rects = segs.map(([kind, min]) => {
    const w = Math.max(3, (min / SCALE_MIN) * BAR_W - GAP);
    const rect = `<rect class="seg seg--${kind}" x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${BAR_H}" rx="3"/>`;
    x += w + GAP;
    return rect;
  });
  return `<svg class="rhythm-bar" viewBox="0 0 ${BAR_W} ${BAR_H}" width="${BAR_W}" height="${BAR_H}" preserveAspectRatio="xMinYMid meet" aria-hidden="true" focusable="false">${rects.join("")}</svg>`;
}

export interface PageInput {
  catalog: Catalog;
  en: Catalog;
  locales: LocaleMeta[];
  version: string;
  /** Root page only: per-locale "read this page in …" offers, shown by site.js. */
  suggestions?: Record<string, LanguageSuggestion>;
}

export interface LanguageSuggestion {
  href: string;
  text: string;
  dismiss: string;
  dir: Dir;
}

export interface RenderedPage {
  html: string;
  jsonLd: string;
}

/** Keys site.js needs at runtime (status lines, labels). */
const RUNTIME_KEYS = [
  "eyebrow", "seeReleases", "allPlatforms", "couldNotReach", "firstBuildCooking", "couldNotRead",
  "taggedWaiting", "checksumFile", "downloadFor", "latestOther", "choosePlatform", "desktopOnly",
  "latestPick", "shaTitle", "osLinux", "osWindows", "osMacos", "osMobile", "osUnknown",
  "archAppleSilicon", "archIntel", "archArm64", "archX64",
] as const;

const FAQ = ["Free", "Account", "Pomodoro", "Which", "Warn", "Update", "Mobile"] as const;

export async function renderPage({ catalog, en, locales, version, suggestions }: PageInput): Promise<RenderedPage> {
  const { meta } = catalog;
  if (meta.dir !== "ltr" && meta.dir !== "rtl") throw new Error(`${meta.code}: _meta.json dir must be ltr or rtl`);
  const lookup = (dict: Dict, path: string): string | undefined => {
    let cur: string | Dict | undefined = dict;
    for (const part of path.split(".")) {
      if (cur === undefined || typeof cur === "string") return undefined;
      cur = cur[part];
    }
    return typeof cur === "string" ? cur : undefined;
  };
  const raw = (key: string, vars: Record<string, string> = {}): string => {
    const s = lookup(catalog.ui, key) ?? lookup(en.ui, key);
    if (s === undefined) throw new Error(`${meta.code}: missing ui key ${key}`);
    return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, v) => vars[v] ?? "");
  };
  /** A sentence list ("a, b and c"), or a bare enumeration of names ("a, b, c"). */
  const list = (items: string[], type: "conjunction" | "unit") => {
    if (type === "unit") {
      const sep: Record<string, string> = { ja: "、", "zh-Hans": "、", ar: "، " };
      return items.join(sep[meta.code] ?? ", ");
    }
    try {
      return new Intl.ListFormat(meta.code, { type: "conjunction" }).format(items);
    } catch {
      return items.join(", ");
    }
  };
  const techniques = TECHNIQUE_IDS.map((id) => {
    const entry = catalog.techniques[id] ?? en.techniques[id];
    return { id, ...entry };
  });
  const nameOf = (id: string) => techniques.find((tq) => tq.id === id)?.name ?? id;
  /** Values any site string may interpolate: localized technique, theme and menu names. */
  const common: Record<string, string> = {
    version,
    rhythms: list(TECHNIQUE_IDS.filter((id) => id !== "custom").map(nameOf), "unit"),
    classic: nameOf("classic"),
    sprint: nameOf("sprint"),
    deep: nameOf("deep"),
    fiftyTwo: nameOf("fifty-two-seventeen"),
    ultradian: nameOf("ultradian"),
    flowtime: nameOf("flowtime"),
    hybrid: nameOf("hybrid"),
    themes: list(["batter", "mist", "grove", "dusk", "sandstone"].map((id) => raw(`themes.${id}`)), "conjunction"),
    about: raw("about.panel"),
    update: raw("updates.updateAndRestart"),
  };
  const site = (key: string, vars?: Record<string, string>) => raw(`site.${key}`, { ...common, ...vars });
  const t = (key: string, vars?: Record<string, string>) => esc(site(key, vars));

  const base = meta.code === "en" ? "./" : "../";
  const self = localeUrl(meta.code);
  const title = site("title");
  const description = site("description");
  const ogDescription = site("ogDescription");
  /** Screenshots in this page's own language (rendered by `deno task website:shots`). */
  const shotsDir = `shots/${meta.code}/`;
  const ogImage = `${ORIGIN}${shotsDir}og.jpg`;

  const jsonLd = scriptJson({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Tempura",
        url: self,
        description,
        inLanguage: meta.code,
        applicationCategory: "ProductivityApplication",
        operatingSystem: "Linux, Windows, macOS",
        softwareVersion: version,
        downloadUrl: LATEST_URL,
        image: ogImage,
        screenshot: SHOT_NAMES.map((s) => `${ORIGIN}${shotsDir}${s}.webp`),
        license: "https://opensource.org/licenses/MIT",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
      {
        "@type": "FAQPage",
        inLanguage: meta.code,
        mainEntity: FAQ.map((k) => ({
          "@type": "Question",
          name: site(`faq${k}Q`),
          acceptedAnswer: { "@type": "Answer", text: site(`faq${k}A`) },
        })),
      },
    ],
  });
  const jsonLdHash = await sha256Base64(jsonLd);

  const runtime = scriptJson({
    locale: meta.code,
    ...(suggestions ? { suggestions } : {}),
    // Uninterpolated: site.js fills {{tag}}, {{os}}, … itself.
    strings: Object.fromEntries(RUNTIME_KEYS.map((k) => [k, lookup(catalog.ui, `site.${k}`) ?? lookup(en.ui, `site.${k}`) ?? ""])),
  });

  const alternates = [
    ...locales.map((l) => `<link rel="alternate" hreflang="${esc(l.code)}" href="${localeUrl(l.code)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${ORIGIN}" />`,
  ].join("\n    ");

  /** Links to English carry ?lang=en: an explicit choice the root page must not redirect away from. */
  const langHref = (code: string) => base + localeSlug(code) + (code === "en" ? "?lang=en" : "");

  const options = locales
    .map((l) => {
      const href = langHref(l.code);
      const sel = l.code === meta.code ? " selected" : "";
      return `<option value="${esc(href)}" data-locale="${esc(l.code)}" lang="${esc(l.code)}"${sel}>${esc(l.nativeName)}</option>`;
    })
    .join("");

  const langLinks = locales
    .map((l) =>
      l.code === meta.code
        ? `<li><span aria-current="page" lang="${esc(l.code)}">${esc(l.nativeName)}</span></li>`
        : `<li><a href="${esc(langHref(l.code))}" hreflang="${esc(l.code)}" lang="${esc(l.code)}" data-locale="${esc(l.code)}">${esc(l.nativeName)}</a></li>`
    )
    .join("");

  const shotWindow = (src: string, alt: string, lazy = false) => `<div class="bezel">
                <div class="window">
                  <div class="titlebar"><span></span><span></span><span></span></div>
                  <img src="${base}${shotsDir}${src}.webp" alt="${alt}" width="420" height="813"${lazy ? ' loading="lazy" decoding="async"' : ""} />
                </div>
              </div>`;

  const card = (title: string, body: string, cls = "point") =>
    `<article class="${cls}"><h3>${title}</h3><p>${body}</p></article>`;

  const html = `<!doctype html>
<html lang="${esc(meta.code)}" dir="${meta.dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="theme-color" content="#d8e2da" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' 'sha256-${jsonLdHash}'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self' https://api.github.com; base-uri 'self'; form-action 'self'; object-src 'none'"
    />
    <link rel="canonical" href="${self}" />
    ${alternates}
    <link rel="icon" type="image/svg+xml" href="${base}icon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="${base}favicon-32.png" />
    <link rel="apple-touch-icon" href="${base}favicon.png" />
    <meta property="og:site_name" content="Tempura" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(ogDescription)}" />
    <meta property="og:url" content="${self}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(title)}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="${esc(meta.code.replace("-", "_"))}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(ogDescription)}" />
    <meta name="twitter:image" content="${ogImage}" />
    <script type="application/ld+json">${jsonLd}</script>
    <script type="application/json" id="site-data">${runtime}</script>${
    meta.code === "en" ? `\n    <script src="./redirect.js"></script>` : ""
  }
    <link rel="stylesheet" href="${base}styles.css" />
  </head>
  <body>
    <div class="grain" aria-hidden="true"></div>${
    suggestions ? `\n    <div class="lang-suggest" id="lang-suggest" role="region" aria-live="polite" hidden></div>` : ""
  }
    <a class="skip" href="#download">${t("skip")}</a>

    <header class="nav-wrap">
      <nav class="nav" aria-label="${t("navAria")}">
        <a class="nav-brand" href="#top">
          <img src="${base}icon.svg" width="28" height="28" alt="" />
          <span>Tempura</span>
        </a>
        <div class="nav-links">
          <a class="nav-optional" href="#techniques">${t("navTechniques")}</a>
          <a class="nav-optional" href="#features">${t("navFeatures")}</a>
          <a class="nav-optional" href="#faq">${t("navFaq")}</a>
          <a href="#download">${t("navDownload")}</a>
          <a href="${REPO_URL}"><bdi>GitHub</bdi></a>
          <label class="lang-switch">
            <span class="visually-hidden">${t("language")}</span>
            <select id="lang-select">${options}</select>
          </label>
        </div>
      </nav>
    </header>

    <main id="top">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow" id="eyebrow">${t("eyebrow")}</p>
          <h1 class="brand">Tem<span>pura</span></h1>
          <p class="lede">${t("lede")}</p>
          <p class="deck">${t("deck")}</p>

          <div class="cta-block" id="download">
            <a class="cta" id="primary-download" href="${LATEST_URL}">
              <span class="cta-label" id="primary-label">${t("ctaLatest")}</span>
              <span class="cta-meta" id="primary-meta">${t("ctaGithub")}</span>
              <span class="cta-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
            </a>
            <p class="cta-status" id="cta-status" role="status">${t("ctaLookingUp")}</p>
            <p class="sha-line" id="sha-line" hidden>SHA-256 <code id="sha-value"></code></p>
          </div>

          <ul class="other-downloads" id="other-downloads" hidden></ul>
          <p class="sums-link" id="sums-link" hidden></p>

          <ul class="facts">
            <li>${t("factFree")}</li>
            <li>${t("factNoAccount")}</li>
            <li>${t("factOffline")}</li>
            <li>${t("factLanguages")}</li>
          </ul>
        </div>

        <div class="gallery" aria-hidden="true">
          <figure class="shot shot--techniques"><div class="tilt">
              ${shotWindow("techniques", "")}
          </div></figure>
          <figure class="shot shot--stats"><div class="tilt">
              ${shotWindow("stats", "")}
          </div></figure>
          <figure class="shot shot--timer"><div class="tilt">
              ${shotWindow("timer", t("timerAlt"))}
          </div></figure>
        </div>
      </section>

      <section class="rhythms" id="techniques" aria-labelledby="rhythms-heading">
        <header class="section-head">
          <h2 id="rhythms-heading">${t("rhythmsHeading")}</h2>
          <p>${t("rhythmsIntro")}</p>
        </header>
        <ul class="technique-grid">
          ${
    techniques
      .map(
        (tq) => `<li class="technique-card technique-card--${esc(tq.id)}">
            <h3>${esc(tq.name)}</h3>
            <p class="technique-best">${esc(tq.bestFor)}</p>
            ${rhythmBar(tq.id)}
            <p class="technique-ratio">${esc(tq.workBreak)}</p>
            <p class="technique-blurb">${esc(tq.blurb)}</p>
          </li>`,
      )
      .join("\n          ")
  }
        </ul>
        <p class="technique-note">${t("techniqueNote")}</p>
      </section>

      <section class="spotlight" id="stats" aria-labelledby="stats-heading">
        <div class="spotlight-copy">
          <h2 id="stats-heading">${t("statsTitle")}</h2>
          <p class="spotlight-body">${t("statsBody")}</p>
          <ul class="ticks">
            <li>${t("statsPoint1")}</li>
            <li>${t("statsPoint2")}</li>
            <li>${t("statsPoint3")}</li>
            <li>${t("statsPoint4")}</li>
            <li>${t("statsPoint5")}</li>
          </ul>
        </div>
        <figure class="spotlight-shot">
          ${shotWindow("stats", t("statsAlt"), true)}
        </figure>
      </section>

      <section class="features" id="features" aria-labelledby="features-heading">
        <h2 class="section-title" id="features-heading">${t("featuresHeading")}</h2>
        <div class="points">
          ${card(t("pointClockTitle"), t("pointClockBody"))}
          ${card(t("pointTrayTitle"), t("pointTrayBody"))}
          ${card(t("featKeysTitle"), t("featKeysBody"))}
          ${card(t("featNotifyTitle"), t("featNotifyBody"))}
          ${card(t("featThemesTitle"), t("featThemesBody"))}
          ${card(t("featLangTitle"), t("featLangBody"))}
        </div>
      </section>

      <section class="privacy" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">${t("pointLocalTitle")}</h2>
        <p>${t("pointLocalBody")}</p>
        <p>${t("privacyUpdates")}</p>
      </section>

      <section class="install" aria-labelledby="install-heading">
        <h2 class="section-title" id="install-heading">${t("installHeading")}</h2>
        <dl>
          <div><dt>${t("osLinux")}</dt><dd>${t("installLinux")}</dd></div>
          <div><dt>${t("osWindows")}</dt><dd>${t("installWindows")}</dd></div>
          <div><dt>${t("osMacos")}</dt><dd>${t("installMacos")}</dd></div>
        </dl>
      </section>

      <section class="faq" id="faq" aria-labelledby="faq-heading">
        <h2 class="section-title" id="faq-heading">${t("faqHeading")}</h2>
        ${
    FAQ.map(
      (k) => `<details>
          <summary>${t(`faq${k}Q`)}</summary>
          <p>${t(`faq${k}A`)}</p>
        </details>`,
    ).join("\n        ")
  }
      </section>

      <section class="final" aria-labelledby="final-heading">
        <img src="${base}shrimp.svg" width="44" height="44" alt="" />
        <h2 id="final-heading">${t("finalTitle")}</h2>
        <p>${t("finalBody")}</p>
        <a class="cta cta--quiet" href="#download">
          <span class="cta-label">${t("finalCta")}</span>
        </a>
      </section>
    </main>

    <footer class="foot">
      <nav class="foot-langs" aria-label="${t("footerLanguages")}">
        <ul>${langLinks}</ul>
      </nav>
      <p>
        <img src="${base}shrimp.svg" width="28" height="28" alt="" />
        <span>${t("footerCopy")}</span>
        ·
        <a href="${REPO_URL}">${t("footerSource")}</a>
        ·
        <a href="${RELEASES_URL}">${t("footerReleases")}</a>
      </p>
      <p class="fine">
        <span>${t("footerTwemoji")}</span>
        <a href="https://github.com/jdecked/twemoji">Twemoji</a>
        <span>${t("footerLicense")}</span>
      </p>
    </footer>

    <script src="${base}site.js" type="module"></script>
  </body>
</html>
`;
  return { html, jsonLd };
}

export function renderSitemap(locales: LocaleMeta[]): string {
  const alts = locales
    .map((l) => `    <xhtml:link rel="alternate" hreflang="${esc(l.code)}" href="${localeUrl(l.code)}"/>`)
    .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}"/>`)
    .join("\n");
  const urls = locales
    .map((l) => `  <url>\n    <loc>${localeUrl(l.code)}</loc>\n${alts}\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}
