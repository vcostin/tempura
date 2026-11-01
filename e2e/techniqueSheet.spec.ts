import { test, expect, type Page } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

const sheet = (page: Page) => page.getByRole("dialog", { name: "Choose a rhythm" });
const option = (page: Page, name: string) =>
  page.locator(".sheet-option", { has: page.locator(".sheet-option-name", { hasText: new RegExp(`^${name}$`) }) });

async function pushState(page: Page, state: Record<string, unknown>) {
  await page.evaluate((s) => (window as any).__tempuraMock.setSnapshot(s), state);
}

/** The rhythm card and the technique sheet it opens. */
test.describe("rhythm card and technique sheet", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".rhythm-card");
  });

  test("the card names the technique and its rhythm, and opens a modal sheet", async ({ page }) => {
    const card = page.locator(".rhythm-card");
    await expect(card).toHaveAttribute("aria-haspopup", "dialog");
    await expect(card).toHaveAttribute("aria-expanded", "false");
    await expect(card).toContainText("Classic");
    await expect(card).toContainText("25 · 5 · 15");
    // Four focus blocks, three short breaks and the long break.
    await expect(card.locator(".strip-seg")).toHaveCount(8);

    await card.click();
    await expect(sheet(page)).toHaveAttribute("aria-modal", "true");
    await expect(card).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("main#timer-main")).toHaveAttribute("inert", "");
    await expect(page.locator(".timer-root header.brand-header")).toHaveAttribute("inert", "");
    await expect(option(page, "Classic")).toHaveAttribute("aria-selected", "true");
    await expect(option(page, "Classic")).toBeFocused();
    await expect(page.getByRole("listbox", { name: "Choose a rhythm" })).toBeVisible();
  });

  test("arrows move, Enter picks and closes; focus goes back to the card", async ({ page }) => {
    await page.locator(".rhythm-card").click();
    await page.keyboard.press("ArrowDown");
    await expect(option(page, "Sprint")).toBeFocused();
    await expect(option(page, "Sprint")).toHaveAttribute("aria-selected", "false");
    await page.keyboard.press("End");
    await expect(option(page, "Hybrid")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(option(page, "Classic")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator(".rhythm-card-name")).toHaveText("Deep");
    await expect(page.locator(".rhythm-card")).toBeFocused();
    const saved = await page.evaluate(() =>
      ((window as any).__tempuraMock.argsLog as [string, any][]).filter(([c]) => c === "update_settings").pop(),
    );
    expect(saved?.[1].settings.defaultTechniqueId).toBe("deep");
  });

  test("a click picks too, and only one row is a Tab stop", async ({ page }) => {
    await page.locator(".rhythm-card").click();
    await expect(page.locator('.sheet-option[tabindex="0"]')).toHaveCount(1);
    await option(page, "52/17").click();
    await expect(page.locator(".rhythm-card-name")).toHaveText("52/17");
  });

  test("your own techniques come first", async ({ page }) => {
    await page.evaluate(() =>
      (window as any).__TAURI_INTERNALS__.invoke("create_technique", {
        input: { name: "Writing", focusSecs: 2400, shortBreakSecs: 480, longBreakSecs: 1200, cyclesBeforeLong: 3, flowRatio: null, accent: null, mode: "classic" },
      }),
    );
    await page.locator(".rhythm-card").click();
    await expect(page.getByRole("group", { name: "Mine" })).toContainText("Writing");
    await expect(page.getByRole("group", { name: "Built-in" })).toContainText("Classic");
    await expect(page.locator(".sheet-option-name").first()).toHaveText("Writing");
  });

  test("inside the sheet, the timer's keys do nothing and Esc only closes it", async ({ page }) => {
    await page.locator(".rhythm-card").click();
    await page.keyboard.press(",");
    await page.keyboard.press("?");
    await expect(page).toHaveURL(/:\d+\/(#\/)?$/);
    await expect(sheet(page)).toBeVisible();

    // Tab stays inside the sheet.
    for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest(".sheet"))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    const calls = await page.evaluate(() => (window as any).__tempuraMock.calls as string[]);
    expect(calls).not.toContain("hide_to_tray");
    await expect(page.locator(".rhythm-card")).toBeFocused();
  });

  test("New opens the editor; Esc returns focus to the card", async ({ page }) => {
    await page.locator(".rhythm-card").click();
    await page.locator('[data-open-panel="technique-new"]').click();
    await page.waitForSelector('[role="dialog"][aria-label="Technique editor"]');
    await expect(page).toHaveURL(/#\/techniques\/new$/);
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached" });
    await expect(page.locator(".rhythm-card")).toBeFocused();
  });

  test("Manage opens the library; Esc returns focus to the card", async ({ page }) => {
    await page.locator(".rhythm-card").click();
    await page.getByRole("button", { name: "Manage techniques" }).click();
    await page.waitForSelector('[role="dialog"][aria-label="Techniques"]');
    await page.keyboard.press("Escape");
    await expect(page.locator(".rhythm-card")).toBeFocused();
  });

  test("while a session runs, the card shows progress through the set", async ({ page }) => {
    await page.locator(".rhythm-card").click();
    // A session started from the tray closes the sheet: no switching mid-session.
    await pushState(page, { running: true, phase: "focus", cycle: 1, remainingSecs: 750, durationSecs: 1500, techniqueId: "classic" });
    await expect(sheet(page)).toHaveCount(0);

    const card = page.locator(".rhythm-card");
    await expect(card).not.toHaveAttribute("aria-haspopup", "dialog");
    expect(await card.evaluate((el) => el.tagName)).toBe("DIV");
    // 12m30s of this focus, then 5 + 25 + 5 + 25 + 15: 1h 28m.
    await expect(card).toContainText("1h 28m left in this set");
    const states = await card.locator(".strip-seg").evaluateAll((els) => els.map((el) => el.getAttribute("data-state")));
    expect(states).toEqual(["done", "done", "now", "todo", "todo", "todo", "todo", "todo"]);
  });
});
