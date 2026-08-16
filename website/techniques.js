const DEFAULT_ID = "sprint";

const tabsEl = document.getElementById("technique-tabs");
const panelEl = document.getElementById("technique-panel");
const nameEl = document.getElementById("technique-name");
const bestEl = document.getElementById("technique-best");
const ratioEl = document.getElementById("technique-ratio");
const blurbEl = document.getElementById("technique-blurb");

if (tabsEl && panelEl && nameEl && bestEl && ratioEl && blurbEl) {
  try {
    const techniques = await fetch("./techniques.json").then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });

  /** @type {string} */
  let selected = DEFAULT_ID;

  function show(id) {
    const entry = techniques.find((t) => t.id === id) ?? techniques[0];
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

  tabsEl.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    const ids = techniques.map((t) => t.id);
    let i = ids.indexOf(selected);
    if (e.key === "ArrowRight") i = (i + 1) % ids.length;
    if (e.key === "ArrowLeft") i = (i - 1 + ids.length) % ids.length;
    if (e.key === "Home") i = 0;
    if (e.key === "End") i = ids.length - 1;
    e.preventDefault();
    show(ids[i]);
    tabsEl.querySelector(`[data-id="${ids[i]}"]`)?.focus();
  });

    show(DEFAULT_ID);
  } catch {
    /* Keep the static Sprint card from the HTML. */
  }
}
