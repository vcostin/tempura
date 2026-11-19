import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { NOW, periodStats } from "./fixtures/sampleStats.ts";
import { installTauriMock } from "./fixtures/tauriMock.ts";

const LOCALES: string[] = JSON.parse(readFileSync(new URL("../locales/manifest.json", import.meta.url), "utf8")).languages;
const stats = {
  ...periodStats,
  byLabel: [
    { kind: "named", name: "Making Tempura with a long task name", techniqueId: null, focusSecs: 116 * 60 },
    { kind: "none", name: null, techniqueId: null, focusSecs: 51 * 60 },
  ],
};

type Finding = { kind: string; what: string; px: number };

async function scan(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const out: { kind: string; what: string; px: number }[] = [];
    const scope = (document.querySelector(".panel-host:not([hidden]) [role='dialog']") ??
      document.querySelector(".sheet, [role='dialog']") ??
      document.querySelector(".timer-root")) as HTMLElement;
    const vw = window.innerWidth;
    const label = (el: Element) => {
      const cls = (el.getAttribute("class") || "").split(" ").filter(Boolean)[0];
      const txt = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
      return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} "${txt}"`;
    };
    if (document.documentElement.scrollWidth > vw + 1) out.push({ kind: "page-hscroll", what: "document", px: document.documentElement.scrollWidth - vw });
    for (const el of scope.querySelectorAll<HTMLElement>("*")) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue; // visually-hidden etc.
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || cs.position === "fixed" && cs.opacity === "0") continue;
      if (el.closest("[aria-hidden='true'], [inert], .visually-hidden")) continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      // Out of the viewport horizontally.
      if (hasText && (r.right > vw + 1 || r.left < -1)) out.push({ kind: "offscreen", what: label(el), px: Math.round(Math.max(r.right - vw, -r.left)) });
      // Hidden horizontal scroll (content behind a scroller).
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1)
        out.push({ kind: "hscroll", what: label(el), px: el.scrollWidth - el.clientWidth });
      // Text cut off without an ellipsis.
      if (hasText && cs.overflowX === "hidden" && cs.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 1)
        out.push({ kind: "clipped", what: label(el), px: el.scrollWidth - el.clientWidth });
      // Truncated with an ellipsis (often intended; listed for review).
      if (el.matches(".rhythm-card-name") && el.scrollWidth > el.clientWidth + 1)
        out.push({ kind: "name-truncated", what: label(el), px: el.scrollWidth - el.clientWidth });
      // Values that must stay on one line (Stats totals, bar durations, built-in technique names).
      if (el.matches(".report-kpi strong, .stats-bars__value")) {
        const range = document.createRange();
        range.selectNodeContents(el);
        if (new Set([...range.getClientRects()].map((q) => Math.round(q.top))).size > 1) out.push({ kind: "value-wraps", what: label(el), px: 0 });
      }
      // Text sticking out of its parent box (buttons, chips, cards).
      const p = el.parentElement;
      if (hasText && p && p !== scope) {
        const pr = p.getBoundingClientRect();
        const pcs = getComputedStyle(p);
        if (pcs.overflowX === "visible" && (r.right > pr.right + 2 || r.left < pr.left - 2) && pr.width > 0)
          out.push({ kind: "overflows-parent", what: `${label(el)} in ${label(p).split(" ")[0]}`, px: Math.round(Math.max(r.right - pr.right, pr.left - r.left)) });
      }
    }
    return out;
  });
}

async function open(page: Page, locale: string, width: number) {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize({ width, height: 760 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installTauriMock(page, { settings: { locale, workingOn: "Making Tempura with a long task name" } });
  await page.goto("/");
  await page.waitForSelector(".rhythm-card");
  await page.evaluate((s) => (window as any).__tempuraMock.setPeriodStats(s), stats);
  await page.evaluate(() => document.fonts.ready);
}

const VIEWS: [string, (page: Page) => Promise<void>][] = [
  ["timer", async () => {}],
  ["timer-running", async (page) => {
    await page.evaluate(() => (window as any).__tempuraMock.setSnapshot({
      running: true, phase: "focus", remainingSecs: 4520, durationSecs: 5400, cycle: 2,
      techniqueId: "ultradian", techniqueName: "Ultradian", workingOn: "Making Tempura with a long task name",
    }));
  }],
  ["technique-sheet", async (page) => { await page.locator(".rhythm-card").click(); await page.waitForTimeout(150); }],
  ...["settings", "stats", "techniques", "techniques/new", "about", "shortcuts"].map((p) => [p, async (page: Page) => {
    await page.evaluate((h) => { location.hash = "#/" + h; }, p);
    await page.locator('.panel-host [role="dialog"]').waitFor();
    if (p === "stats") await page.locator(".stats-bars").first().waitFor();
    await page.waitForTimeout(150);
  }] as [string, (page: Page) => Promise<void>]),
];

/**
 * Layout sweep: every screen × every UI language × the default (420 px) and minimum (360 px)
 * widths. Nothing may stick out of the window, scroll sideways, get cut off without an
 * ellipsis, or overflow its box; Stats totals and bar durations stay on one line; built-in
 * technique names on the timer are never truncated. Screen-reader-only content is skipped.
 */
for (const width of [360, 420]) {
  for (const locale of LOCALES) {
    test(`layout sweep ${width}px (${locale})`, async ({ page }) => {
      test.setTimeout(60_000);
      const findings: string[] = [];
      for (const [view, go] of VIEWS) {
        await open(page, locale, width);
        await go(page);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        for (const f of await scan(page)) findings.push(`${view}: ${f.kind} ${f.what} (${f.px}px)`);
      }
      expect(findings, findings.join("\n")).toEqual([]);
    });
  }
}
