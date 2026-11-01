import { test, expect, type Page } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

async function openSheet(page: Page) {
  await page.locator(".rhythm-card").click();
  await expect(page.getByRole("dialog", { name: "Choose a rhythm" })).toBeVisible();
}

const option = (page: Page, name: string) =>
  page.locator(".sheet-option", { has: page.locator(".sheet-option-name", { hasText: new RegExp(`^${name}$`) }) });

async function hide(page: Page, name: string) {
  await option(page, name).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Hide from timer" }).click();
}

/** Hiding techniques from the timer's sheet, and getting them back. */
test.describe("hide techniques from the timer", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".rhythm-card");
    await openSheet(page);
  });

  test("right-click hides a technique; Undo brings it back", async ({ page }) => {
    await option(page, "Deep").click({ button: "right" });
    await expect(page.getByRole("menu", { name: "Deep" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Hide from timer" })).toBeFocused();
    await page.getByRole("menuitem", { name: "Hide from timer" }).click();

    await expect(option(page, "Deep")).toHaveCount(0);
    await expect(page.locator(".sheet-hidden")).toHaveText("1 hidden");
    await expect(page.locator(".toast")).toContainText("Deep hidden from the timer");
    // The sheet stays open, and focus lands on the selected technique.
    await expect(option(page, "Classic")).toBeFocused();

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(option(page, "Deep")).toHaveCount(1);
    await expect(page.locator(".sheet-hidden")).toHaveCount(0);
  });

  test("the selected one can't be hidden; Shift+F10 opens the menu and Esc closes it", async ({ page }) => {
    await expect(option(page, "Classic")).toBeFocused();
    await page.keyboard.press("Shift+F10");
    const hideItem = page.getByRole("menuitem", { name: "Hide from timer" });
    await expect(hideItem).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator(".chip-menu-hint")).toHaveText("The selected technique stays on the timer.");

    // Esc closes the menu first, then the sheet; it never leaves the timer.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(option(page, "Classic")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".rhythm-card")).toBeFocused();
    await expect(page).toHaveURL(/:\d+\/(#\/)?$/);
  });

  test("N hidden opens the library with hidden first; the eye toggle shows it again", async ({ page }) => {
    await hide(page, "Ultradian");
    await page.locator(".sheet-hidden").click();

    await page.waitForSelector('[role="dialog"][aria-label="Techniques"]');
    await expect(page.getByRole("tab", { name: /Built-in/ })).toHaveAttribute("aria-selected", "true");
    const first = page.locator(".library-row").first();
    await expect(first).toHaveClass(/is-hidden/);
    await expect(first).toContainText("Ultradian");

    const eye = page.getByRole("button", { name: "Show on timer: Ultradian" });
    await expect(eye).toHaveAttribute("aria-pressed", "false");
    await eye.click();
    await expect(eye).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".library-row").first()).not.toHaveClass(/is-hidden/);

    // Hiding from the library is just as easy, and the row stays put.
    await page.getByRole("button", { name: "Show on timer: Sprint" }).click();
    await expect(page.getByRole("button", { name: "Show on timer: Sprint" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "Show on timer: Classic" })).toHaveAttribute("aria-disabled", "true");

    await page.keyboard.press("Escape");
    await expect(page.locator(".rhythm-card")).toBeFocused();
    await openSheet(page);
    await expect(option(page, "Ultradian")).toHaveCount(1);
    await expect(option(page, "Sprint")).toHaveCount(0);
  });

  test("using a hidden technique from the library puts it back on the timer", async ({ page }) => {
    await hide(page, "Sprint");
    await page.locator(".sheet-hidden").click();
    await page.locator(".library-row-head", { hasText: "Sprint" }).click();
    await page.getByRole("button", { name: "Use" }).click();

    await expect(page.locator(".rhythm-card-name")).toHaveText("Sprint");
    await page.keyboard.press("Escape");
    await openSheet(page);
    await expect(page.locator(".sheet-hidden")).toHaveCount(0);
  });

  test("everything but the selected technique can be hidden", async ({ page }) => {
    for (const name of ["Sprint", "Deep", "52/17", "Ultradian", "Flowtime", "Hybrid"]) await hide(page, name);
    await expect(page.locator(".sheet-option")).toHaveCount(1);
    await expect(page.locator(".sheet-hidden")).toHaveText("6 hidden");
  });
});
