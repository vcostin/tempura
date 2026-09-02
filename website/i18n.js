import i18next from "./vendor/i18next.js";

const STORAGE_KEY = "tempura-locale";

/** @typedef {{ code: string, name: string, nativeName: string, dir: "ltr" | "rtl" }} LocaleMeta */

/** @type {LocaleMeta[]} */
let metas = [];

export const i18n = i18next;

export function t(key, opts) {
  return i18next.t(key, opts);
}

export function currentLocale() {
  return i18next.language || "en";
}

/** @param {string} tag */
export function resolveLocale(tag, codes) {
  const raw = (tag || "en").trim();
  if (!raw) return "en";
  const set = new Set(codes);
  if (set.has(raw)) return raw;
  const lower = raw.toLowerCase();
  const exact = codes.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;
  const base = raw.split("-")[0]?.toLowerCase() ?? "";
  if (base === "zh" && set.has("zh-Hans")) return "zh-Hans";
  if (base === "pt" && set.has("pt-BR")) return "pt-BR";
  const prefixed = codes.find(
    (c) => c.toLowerCase() === base || c.toLowerCase().startsWith(`${base}-`),
  );
  return prefixed ?? "en";
}

function applyDocument(code, dir) {
  document.documentElement.lang = code;
  document.documentElement.dir = dir === "rtl" ? "rtl" : "ltr";
}

function fillDom() {
  const version = document.getElementById("version-label")?.textContent?.trim() || "0.1.0";
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const key = el.getAttribute("data-i18n");
    if (!key) continue;
    el.textContent = i18next.t(key, { version });
  }
  for (const el of document.querySelectorAll("[data-i18n-html]")) {
    const key = el.getAttribute("data-i18n-html");
    if (!key) continue;
    el.innerHTML = i18next.t(key);
  }
  for (const el of document.querySelectorAll("[data-i18n-attr]")) {
    const spec = el.getAttribute("data-i18n-attr");
    if (!spec) continue;
    for (const part of spec.split(";")) {
      const [attr, key] = part.split(":").map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, i18next.t(key));
    }
  }
  const title = i18next.t("site.title");
  document.title = title;
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute("content", title);
  const desc = i18next.t("site.description");
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute("content", desc);
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute("content", i18next.t("site.ogDescription"));
}

function populateSwitcher(select) {
  if (!select) return;
  select.replaceChildren(
    ...metas.map((m) => {
      const opt = document.createElement("option");
      opt.value = m.code;
      opt.textContent = m.nativeName;
      return opt;
    }),
  );
  select.value = currentLocale();
  select.addEventListener("change", () => {
    void setLocale(select.value);
  });
}

async function loadBundle(code) {
  const [ui, techniques, meta] = await Promise.all([
    fetch(`./locales/${code}/ui.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }),
    fetch(`./locales/${code}/techniques.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }),
    fetch(`./locales/${code}/_meta.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }),
  ]);
  i18next.addResourceBundle(code, "ui", ui, true, true);
  i18next.addResourceBundle(code, "techniques", techniques, true, true);
  return /** @type {LocaleMeta} */ (meta);
}

export async function setLocale(code) {
  let meta = metas.find((m) => m.code === code);
  if (!i18next.hasResourceBundle(code, "ui")) {
    meta = await loadBundle(code);
    if (!metas.some((m) => m.code === code)) metas.push(meta);
  }
  await i18next.changeLanguage(code);
  localStorage.setItem(STORAGE_KEY, code);
  applyDocument(code, meta?.dir ?? "ltr");
  fillDom();
  document.dispatchEvent(new CustomEvent("tempura:locale", { detail: { locale: code } }));
}

const ready = (async () => {
  const manifest = await fetch("./locales/manifest.json").then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  });
  const codes = /** @type {string[]} */ (manifest.languages ?? manifest);
  const stored = localStorage.getItem(STORAGE_KEY) || "";
  const initial = resolveLocale(stored || navigator.language, codes);

  await i18next.init({
    lng: "en",
    fallbackLng: "en",
    ns: ["ui", "techniques"],
    defaultNS: "ui",
    interpolation: { escapeValue: false },
    returnNull: false,
  });

  if (initial !== "en") {
    try {
      await loadBundle("en");
    } catch {
      /* English is also fetched as the chosen locale below. */
    }
  }
  const meta = await loadBundle(initial);
  metas = [meta];
  await Promise.all(
    codes
      .filter((c) => c !== initial)
      .map(async (code) => {
        try {
          const m = await fetch(`./locales/${code}/_meta.json`).then((r) => {
            if (!r.ok) throw new Error(String(r.status));
            return r.json();
          });
          metas.push(m);
        } catch {
          /* skip incomplete locales */
        }
      }),
  );
  metas.sort((a, b) => {
    if (a.code === "en") return -1;
    if (b.code === "en") return 1;
    return a.nativeName.localeCompare(b.nativeName, "en");
  });

  await i18next.changeLanguage(initial);
  applyDocument(initial, meta.dir);
  fillDom();
  populateSwitcher(document.getElementById("lang-select"));
})();

export function refresh() {
  fillDom();
}

export const whenReady = ready;
