import { t, whenReady } from "./i18n.js";

const DEFAULT_ID = "sprint";

const tabsEl = document.getElementById("technique-tabs");
const panelEl = document.getElementById("technique-panel");
const nameEl = document.getElementById("technique-name");
const bestEl = document.getElementById("technique-best");
const ratioEl = document.getElementById("technique-ratio");
const blurbEl = document.getElementById("technique-blurb");

function techniqueIds() {
  const bundle = t("classic", { ns: "techniques", returnObjects: true });
  const keys = ["classic", "sprint", "deep", "fifty-two-seventeen", "ultradian", "flowtime", "hybrid", "custom"];
  if (bundle && typeof bundle === "object" && !Array.isArray(bundle) && bundle.name) {
    return keys.filter((id) => {
      const entry = t(id, { ns: "techniques", returnObjects: true });
      return entry && typeof entry === "object" && entry.name;
    });
  }
  return keys;
}

function entryOf(id) {
  const entry = t(id, { ns: "techniques", returnObjects: true });
  if (entry && typeof entry === "object" && entry.name) return { id, ...entry };
  return null;
}

await whenReady;

if (tabsEl && panelEl && nameEl && bestEl && ratioEl && blurbEl) {
  /** @type {string} */
  let selected = DEFAULT_ID;

  function show(id) {
    const ids = techniqueIds();
    const entry = entryOf(id) ?? entryOf(ids[0]);
    if (!entry) return;
    selected = entry.id;
    nameEl.textContent = entry.name;
    bestEl.textContent = entry.bestFor;
    ratioEl.textContent = entry.workBreak;
    blurbEl.textContent = entry.blurb;
    panelEl.setAttribute("aria-labelledby", `technique-tab-${entry.id}`);
    for (const btn of tabsEl.querySelectorAll("[role='tab']")) {
      const on = btn.dataset.id === entry.id;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
      btn.classList.toggle("is-hot", on);
    }
  }

  function renderTabs() {
    const techniques = techniqueIds()
      .map(entryOf)
      .filter(Boolean);
    tabsEl.replaceChildren(
      ...techniques.map((entry) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.role = "tab";
        btn.id = `technique-tab-${entry.id}`;
        btn.dataset.id = entry.id;
        btn.setAttribute("aria-controls", "technique-panel");
        btn.textContent = entry.name;
        btn.addEventListener("click", () => show(entry.id));
        return btn;
      }),
    );
    show(selected);
  }

  tabsEl.addEventListener("keydown", (e) => {
    const rtl = document.documentElement.dir === "rtl";
    const next = rtl ? "ArrowLeft" : "ArrowRight";
    const prev = rtl ? "ArrowRight" : "ArrowLeft";
    if (e.key !== next && e.key !== prev && e.key !== "Home" && e.key !== "End") {
      return;
    }
    const ids = techniqueIds();
    let i = ids.indexOf(selected);
    if (e.key === next) i = (i + 1) % ids.length;
    if (e.key === prev) i = (i - 1 + ids.length) % ids.length;
    if (e.key === "Home") i = 0;
    if (e.key === "End") i = ids.length - 1;
    e.preventDefault();
    show(ids[i]);
    tabsEl.querySelector(`[data-id="${ids[i]}"]`)?.focus();
  });

  renderTabs();
  document.addEventListener("tempura:locale", () => renderTabs());
}
