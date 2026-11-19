import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { installTauriMock } from "../fixtures/tauriMock.ts";

/**
 * The website's gallery, in every UI language: website/shots/<locale>/{timer,techniques,stats}.webp
 * plus og.jpg (social preview). Sample task names come from sample.json so no shot is half English.
 * tests/unit/websiteI18n.test.ts checks that every locale has all files and that each page uses its own.
 */
const SHOTS = new URL("../../website/shots/", import.meta.url).pathname;
const LOCALES: string[] = JSON.parse(readFileSync(new URL("../../locales/manifest.json", import.meta.url), "utf8")).languages;
const SAMPLE: Record<string, { task: string; thesis: string; writing: string }> = JSON.parse(
  readFileSync(new URL("./sample.json", import.meta.url), "utf8"),
);
const missing = LOCALES.filter((l) => !SAMPLE[l]);
if (missing.length) throw new Error(`e2e/shots/sample.json has no sample data for: ${missing.join(", ")}`);

/** Settle before a capture: fonts loaded (CJK/Arabic/Hebrew are bundled with the app), two frames painted. */
async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}
const SIZE = { width: 420, height: 813 };
// Thursday 15 October 2026, mid-afternoon.
const NOW = new Date(2026, 9, 15, 15, 20);

const hourCells = (weekday: number, hours: [number, number][]) =>
  hours.map(([hour, mins]) => ({ weekday, hour, focusSecs: mins * 60, cycles: Math.round(mins / 25) }));

const week = [
  // Monday … Thursday (today): minutes per hour.
  hourCells(0, [[9, 50], [10, 55], [11, 30], [14, 45], [15, 25]]),
  hourCells(1, [[8, 25], [9, 55], [10, 50], [16, 40]]),
  hourCells(2, [[9, 40], [10, 55], [11, 55], [13, 20], [14, 50]]),
  hourCells(3, [[8, 15], [9, 50], [10, 55], [11, 25], [14, 20]]),
].flat();

const usage = (techniqueId: string, name: string, mode: string, hours: number, finished: number, ended: number) => ({
  techniqueId, name, mode, focusSecs: hours * 3600, sessions: ended, finished, ended,
});

const periodStats = {
  focusSecs: week.reduce((s, c) => s + c.focusSecs, 0),
  completedCycles: 31,
  sessions: 14,
  activeDays: 4,
  longestStreak: 9,
  buckets: [0, 1, 2, 3].map((d) => ({
    date: `2026-10-${12 + d}`,
    focusSecs: week.filter((c) => c.weekday === d).reduce((s, c) => s + c.focusSecs, 0),
    completedCycles: 8,
    sessions: 4,
  })),
  hours: week,
  weekdayCounts: [1, 1, 1, 1, 1, 1, 1],
  techniques: [
    usage("fifty-two-seventeen", "52/17", "classic", 6.5, 5, 6),
    usage("sprint", "Sprint", "classic", 3, 4, 5),
    usage("flowtime", "Flowtime", "flowtime", 2.5, 0, 3),
  ],
  byLabel: [
    { kind: "named", name: "{{task}}", techniqueId: null, focusSecs: 7 * 3600 },
    { kind: "named", name: "{{thesis}}", techniqueId: null, focusSecs: 4 * 3600 },
    { kind: "none", name: null, techniqueId: null, focusSecs: 1 * 3600 },
  ],
  previous: { from: "2026-10-05", to: "2026-10-08", focusSecs: 9 * 3600, completedCycles: 22, sessions: 11, activeDays: 4 },
  firstDay: "2026-03-10",
};

/** Period stats with this locale's sample task names. */
function statsFor(locale: string, hours = week) {
  const sample = SAMPLE[locale];
  return {
    ...periodStats,
    hours,
    byLabel: periodStats.byLabel.map((l) => ({
      ...l,
      name: l.name === "{{task}}" ? sample.task : l.name === "{{thesis}}" ? sample.thesis : l.name,
    })),
  };
}

/** Encode a PNG as WebP in the browser (no extra tools); returns the bytes. */
async function toWebp(page: Page, png: Buffer): Promise<Buffer> {
  const b64 = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return canvas.toDataURL("image/webp", 0.86).split(",")[1];
  }, `data:image/png;base64,${png.toString("base64")}`);
  return Buffer.from(b64, "base64");
}

async function save(page: Page, locale: string, name: string) {
  const dir = `${SHOTS}${locale}/`;
  mkdirSync(dir, { recursive: true });
  const png = await page.screenshot();
  writeFileSync(`${dir}${name}.webp`, await toWebp(page, png));
}

/**
 * The social preview (og.jpg, 1200×630): wordmark, tagline and pitch in this locale beside the
 * timer shot. Drawn inside the app page so it uses the app's bundled fonts (Noto for CJK/Arabic/Hebrew).
 */
async function socialCard(page: Page, locale: string) {
  const ui = JSON.parse(readFileSync(new URL(`../../locales/${locale}/ui.json`, import.meta.url), "utf8"));
  const dir = JSON.parse(readFileSync(new URL(`../../locales/${locale}/_meta.json`, import.meta.url), "utf8")).dir;
  const shot = readFileSync(`${SHOTS}${locale}/timer.webp`).toString("base64");
  const site = ui.site;
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.evaluate(
    ({ dir, lang, lede, pitch, facts, shot }) => {
      const style = document.createElement("style");
      style.textContent = `
        html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
        .og { box-sizing: border-box; width: 1200px; height: 630px; display: grid;
          grid-template-columns: 1fr 360px; gap: 40px; padding: 64px 72px 0;
          color: #1e2a32; font-family: var(--font-sans);
          background: radial-gradient(ellipse at 28% 18%, rgba(196,122,44,.22), transparent 55%),
            radial-gradient(ellipse at 82% 78%, rgba(184,90,106,.14), transparent 50%),
            linear-gradient(165deg, #d8e2da 0%, #c5d1c8 100%); }
        .og-copy { align-self: start; padding-top: 28px; }
        .og-brand { margin: 0; font-family: var(--font-serif); font-weight: 600; font-size: 112px;
          letter-spacing: -0.035em; line-height: .92; direction: ltr; unicode-bidi: isolate; }
        [dir="rtl"] .og-brand { text-align: right; }
        .og-brand span { color: #c47a2c; }
        .og-lede { margin: 22px 0 0; font-family: var(--font-serif); font-weight: 500; font-size: 40px; color: #c47a2c; }
        .og-pitch { margin: 22px 0 0; font-size: 27px; line-height: 1.4; color: #3d4c50; max-width: 640px; }
        .og-facts { display: flex; flex-wrap: wrap; gap: 10px 22px; margin: 30px 0 0; padding: 0; list-style: none;
          font-size: 21px; font-weight: 500; color: #5a6b66; }
        .og-facts li { display: inline-flex; align-items: center; gap: 10px; }
        .og-facts li::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: #c47a2c; }
        .og-shot { align-self: start; margin-top: 10px; padding: 8px; border-radius: 28px;
          background: rgba(30,42,50,.05); border: 1px solid rgba(30,42,50,.06);
          box-shadow: 0 30px 60px rgba(30,42,50,.16); transform: rotate(3deg); }
        [dir="rtl"] .og-shot { transform: rotate(-3deg); }
        .og-shot img { display: block; width: 100%; border-radius: 20px; }`;
      const root = document.createElement("div");
      root.className = "og";
      root.dir = dir;
      root.lang = lang;
      const copy = document.createElement("div");
      copy.className = "og-copy";
      const brand = document.createElement("p");
      brand.className = "og-brand";
      brand.append("Tem");
      const accent = document.createElement("span");
      accent.textContent = "pura";
      brand.append(accent);
      const ledeEl = document.createElement("p");
      ledeEl.className = "og-lede";
      ledeEl.textContent = lede;
      const pitchEl = document.createElement("p");
      pitchEl.className = "og-pitch";
      pitchEl.textContent = pitch;
      const list = document.createElement("ul");
      list.className = "og-facts";
      for (const f of facts) {
        const li = document.createElement("li");
        li.textContent = f;
        list.append(li);
      }
      copy.append(brand, ledeEl, pitchEl, list);
      const fig = document.createElement("div");
      fig.className = "og-shot";
      const img = document.createElement("img");
      img.src = `data:image/webp;base64,${shot}`;
      fig.append(img);
      root.append(copy, fig);
      document.head.append(style);
      document.body.replaceChildren(root);
      return img.decode();
    },
    {
      dir,
      lang: locale,
      lede: site.lede,
      pitch: site.ogDescription,
      facts: [site.factFree, site.factNoAccount, `${site.osLinux} · ${site.osWindows} · ${site.osMacos}`],
      shot,
    },
  );
  await settle(page);
  await page.screenshot({ path: `${SHOTS}${locale}/og.jpg`, type: "jpeg", quality: 84 });
}

async function open(page: Page, locale: string) {
  const sample = SAMPLE[locale];
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize(SIZE);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installTauriMock(page, { settings: { theme: "batter", locale, defaultTechniqueId: "sprint", workingOn: sample.task } });
  await page.addInitScript(() => {
    const i = (window as any).__TAURI_INTERNALS__;
    const invoke = i.invoke.bind(i);
    i.invoke = async (cmd: string, args: any) =>
      cmd === "get_stats" ? { focusSecsToday: 2 * 3600 + 45 * 60, completedCyclesToday: 7, sessionsToday: 3, streakDays: 9 } : invoke(cmd, args);
  });
  await page.goto("/");
  await page.waitForSelector(".rhythm-card");
  await page.evaluate((stats) => {
    const mock = (window as any).__tempuraMock;
    mock.setPeriodStats(stats);
    mock.emit("stats-updated");
  }, statsFor(locale, week.filter((c) => c.weekday === 3)));
}

for (const locale of LOCALES) {
  test.describe(locale, () => {
    test("timer", async ({ page }) => {
      await open(page, locale);
      await page.evaluate((task) =>
        (window as any).__tempuraMock.setSnapshot({
          running: true, phase: "focus", remainingSecs: 6 * 60 + 20, durationSecs: 15 * 60, cycle: 2,
          techniqueId: "sprint", techniqueName: "Sprint", workingOn: task,
        }), SAMPLE[locale].task);
      // The task name is the value of the "working on" field, not text.
      await page.waitForFunction(
        (task) => [...document.querySelectorAll<HTMLInputElement>(".timer-root input")].some((i) => i.value === task),
        SAMPLE[locale].task,
      );
      await settle(page);
      await save(page, locale, "timer");
      await socialCard(page, locale);
    });

    test("technique sheet", async ({ page }) => {
      await open(page, locale);
      await page.evaluate((name) =>
        (window as any).__TAURI_INTERNALS__.invoke("create_technique", {
          input: { name, focusSecs: 40 * 60, shortBreakSecs: 8 * 60, longBreakSecs: 20 * 60, cyclesBeforeLong: 3, flowRatio: null, accent: null, mode: "classic" },
        }), SAMPLE[locale].writing);
      await page.locator(".rhythm-card").click();
      await page.locator(".sheet-option").first().hover();
      await page.mouse.move(0, 0);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.locator(".sheet-option").getByText(SAMPLE[locale].writing).first().waitFor();
      await settle(page);
      await save(page, locale, "techniques");
    });

    test("stats", async ({ page }) => {
      await open(page, locale);
      await page.evaluate((stats) => (window as any).__tempuraMock.setPeriodStats(stats), statsFor(locale));
      await page.locator('[data-open-panel="stats"]').click();
      await page.waitForSelector('[role="dialog"]');
      // Top of the panel: period picker, totals and the weekday × hour map (what the website copy leads with).
      // The localized task names render further down; wait for them so the data is in place.
      await page.locator(".stats-bars").getByText(SAMPLE[locale].task).first().waitFor();
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await settle(page);
      await save(page, locale, "stats");
    });
  });
}
