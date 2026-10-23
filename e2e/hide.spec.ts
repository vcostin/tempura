import { test, expect } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/** Hiding techniques from the timer's picker, and getting them back. */
test.describe("hide techniques from the timer", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".picker .chip");
  });

  const chip = (page: import("@playwright/test").Page, name: string) =>
    page.locator(".picker .chip", { hasText: new RegExp(`^${name}$`) });

  test("right-click hides a chip; Undo brings it back", async ({ page }) => {
    await chip(page, "Deep").click({ button: "right" });
    const menu = page.getByRole("menu", { name: "Deep" });
    await expect(menu).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Hide from timer" })).toBeFocused();
    await page.getByRole("menuitem", { name: "Hide from timer" }).click();

    await expect(chip(page, "Deep")).toHaveCount(0);
    await expect(page.locator(".chip-hidden")).toHaveText("1 hidden");
    await expect(page.locator(".toast")).toContainText("Deep hidden from the timer");

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(chip(page, "Deep")).toHaveCount(1);
    await expect(page.locator(".chip-hidden")).toHaveCount(0);
  });

  test("the selected chip can't be hidden; Shift+F10 opens the menu and Esc closes it", async ({ page }) => {
    await chip(page, "Classic").focus();
    await page.keyboard.press("Shift+F10");
    const hide = page.getByRole("menuitem", { name: "Hide from timer" });
    await expect(hide).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator(".chip-menu-hint")).toHaveText(
      "The selected technique stays on the timer.",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(chip(page, "Classic")).toBeFocused();
    // Esc in the menu doesn't also leave the timer.
    await expect(page).toHaveURL(/:1420\/(#\/)?$/);
  });

  test("hidden chip opens the library with hidden first; the eye toggle shows it again", async ({ page }) => {
    await chip(page, "Ultradian").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Hide from timer" }).click();
    await page.locator(".chip-hidden").click();

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
    await expect(page.getByRole("button", { name: "Show on timer: Sprint" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByRole("button", { name: "Show on timer: Classic" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await page.keyboard.press("Escape");
    await expect(chip(page, "Ultradian")).toHaveCount(1);
    await expect(chip(page, "Sprint")).toHaveCount(0);
  });

  test("using a hidden technique from the library puts it back on the timer", async ({ page }) => {
    await chip(page, "Sprint").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Hide from timer" }).click();
    await page.locator(".chip-hidden").click();
    await page.locator(".library-row-head", { hasText: "Sprint" }).click();
    await page.getByRole("button", { name: "Use" }).click();

    await expect(chip(page, "Sprint")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".chip-hidden")).toHaveCount(0);
  });

  test("everything but the selected technique can be hidden", async ({ page }) => {
    for (const name of ["Sprint", "Deep", "52/17", "Ultradian", "Flowtime", "Hybrid"]) {
      await chip(page, name).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Hide from timer" }).click();
    }
    await expect(page.locator(".picker .chip[aria-pressed]")).toHaveCount(1);
    await expect(page.locator(".chip-hidden")).toHaveText("6 hidden");
  });
});
