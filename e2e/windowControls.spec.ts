import { test, expect, type Page } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/**
 * Linux and Windows run without the system title bar, so Tempura draws its own:
 * a drag strip and two corner buttons (see WindowControls). The test browser is a
 * desktop shell on Linux, so it gets the Linux chrome, rounded corners included.
 */
const calls = (page: Page) => page.evaluate(() => (window as any).__tempuraMock.calls as string[]);

for (const [locale, menu, minimize, maximize, close] of [
  ["en", "Window menu", "Minimize", "Maximize", "Close"],
  ["ar", "قائمة النافذة", "تصغير", "تكبير", "إغلاق"],
] as const) {
  test.describe(`window controls (${locale})`, () => {
    test.beforeEach(async ({ page }) => {
      await installTauriMock(page, { settings: { locale } });
      await page.goto("/");
      await page.waitForSelector(".brand-header");
    });

    test("minimize and close go to the window", async ({ page }) => {
      await page.getByRole("button", { name: minimize, exact: true }).click();
      await page.getByRole("button", { name: close, exact: true }).click();
      const sent = await calls(page);
      expect(sent).toContain("plugin:window|minimize");
      expect(sent).toContain("plugin:window|close");
    });

    test("the buttons sit in the corner, clear of the header", async ({ page }) => {
      const controls = await page.locator(".window-controls").boundingBox();
      const header = await page.locator(".brand-header").boundingBox();
      const width = page.viewportSize()!.width;
      expect(controls && header).toBeTruthy();
      expect(controls!.y + controls!.height).toBeLessThanOrEqual(header!.y);
      // The end corner: right in left-to-right, left in right-to-left.
      if (locale === "ar") expect(controls!.x).toBeLessThan(width / 2);
      else expect(controls!.x).toBeGreaterThan(width / 2);
    });

    test("the shrimp mark opens the window menu", async ({ page }) => {
      const mark = page.getByRole("button", { name: menu, exact: true });
      await mark.click();
      const list = page.getByRole("menu", { name: menu });
      await expect(list.getByRole("menuitem")).toHaveText([minimize, maximize, close]);
      // No way to stay on top here (the mock says so, as Wayland would).
      await expect(list.getByRole("menuitemcheckbox")).toHaveCount(0);
      await expect(list.getByRole("menuitem", { name: minimize })).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(list.getByRole("menuitem", { name: maximize })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(list).toHaveCount(0);
      await expect(mark).toBeFocused();

      await mark.click({ button: "right" });
      await list.getByRole("menuitem", { name: maximize }).click();
      await expect(list).toHaveCount(0);
      expect(await calls(page)).toContain("plugin:window|toggle_maximize");
    });

    test("scrolled content stays below the title strip", async ({ page }) => {
      const strip = (await page.locator(".window-drag-strip").boundingBox())!;
      const below = async (sel: string) => {
        const box = (await page.locator(sel).boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(strip.y + strip.height);
      };
      await below(".app-shell");
      await page.keyboard.press(",");
      await below(".panel-scroll");
      // The frame itself still fills the window, so the corner buttons show.
      expect(await page.evaluate(() => document.body.getBoundingClientRect().top)).toBe(0);
    });

    test("the header drags the window", async ({ page }) => {
      await expect(page.locator(".brand-header")).toHaveAttribute("data-tauri-drag-region", "deep");
    });
  });
}

test.describe("rounded window (Linux)", () => {
  const radius = (page: Page) => page.evaluate(() => getComputedStyle(document.body).borderTopLeftRadius);

  test("the corners are round, and square while maximized", async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".brand-header");
    expect(await radius(page)).toBe("12px");
    await page.evaluate(() => (document.documentElement.dataset.maximized = "true"));
    expect(await radius(page)).toBe("0px");
  });
});

test("Always on top shows where the desktop allows it", async ({ page }) => {
  await installTauriMock(page);
  await page.addInitScript(() => {
    const internals = (window as any).__TAURI_INTERNALS__;
    const invoke = internals.invoke;
    internals.invoke = (cmd: string, args: unknown) => (cmd === "window_can_stay_on_top" ? Promise.resolve(true) : invoke(cmd, args));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Window menu" }).click();
  const item = page.getByRole("menuitemcheckbox", { name: "Always on top" });
  await expect(item).toHaveAttribute("aria-checked", "false");
  await item.click();
  expect(await calls(page)).toContain("plugin:window|set_always_on_top");
});
