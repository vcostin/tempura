import { test, expect } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/** Technique library and editor flows against an in-page mock of the Rust commands. */
test.describe("techniques library and editor", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".picker .chip");
  });

  test("library opens on Built-in with no custom techniques; tabs follow arrow keys", async ({ page }) => {
    await page.locator('[data-open-panel="techniques"]').first().click();
    await page.waitForSelector('[role="dialog"][aria-label="Techniques"]');

    const builtIn = page.getByRole("tab", { name: /Built-in/ });
    await expect(builtIn).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".library-row")).toHaveCount(7);

    await builtIn.focus();
    await page.keyboard.press("ArrowLeft");
    const mine = page.getByRole("tab", { name: /Mine/ });
    await expect(mine).toHaveAttribute("aria-selected", "true");
    await expect(mine).toBeFocused();
    await expect(page.locator(".library-empty")).toBeVisible();
  });

  test("customize a built-in, save, and land on Mine with it selected", async ({ page }) => {
    await page.locator('[data-open-panel="techniques"]').first().click();
    await page.locator(".library-row-head", { hasText: "Classic" }).first().click();
    await page.getByRole("button", { name: "Customize: Classic" }).click();

    await expect(page).toHaveURL(/#\/techniques\/new\?from=classic$/);
    await expect(page.locator("#c-name")).toHaveValue("Classic (copy)");
    await page.fill("#c-focus", "30");
    await expect(page.locator(".editor-preview")).toContainText("30m focus");
    await page.getByRole("button", { name: "Add technique" }).click();

    await page.waitForSelector('[role="dialog"][aria-label="Techniques"]');
    await expect(page.getByRole("tab", { name: /Mine/ })).toHaveAttribute("aria-selected", "true");
    const row = page.locator(".library-row", { hasText: "Classic (copy)" });
    await expect(row).toContainText("Selected");

    await page.keyboard.press("Escape");
    await expect(page.locator(".picker .chip", { hasText: "Classic (copy)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("edit and delete from the library; selection falls back to Classic", async ({ page }) => {
    await page.locator('[data-open-panel="technique-new"]').click();
    await page.fill("#c-name", "Writing");
    await page.getByRole("button", { name: "Add technique" }).click();
    await expect(page.locator(".picker .chip", { hasText: "Writing" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.locator('[data-open-panel="settings"]').click();
    await page.getByRole("button", { name: /Manage techniques/ }).click();
    await page.locator(".library-row-head", { hasText: "Writing" }).click();
    await page.getByRole("button", { name: "Edit: Writing" }).click();
    await expect(page).toHaveURL(/#\/techniques\/custom-1\/edit$/);

    const del = page.getByRole("button", { name: "Delete" });
    await del.click();
    await expect(page.getByRole("button", { name: "Delete for good?" })).toBeVisible();
    await page.getByRole("button", { name: "Delete for good?" }).click();

    await page.waitForSelector('[role="dialog"][aria-label="Techniques"]');
    await expect(page.locator(".library-empty")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".picker .chip", { hasText: "Writing" })).toHaveCount(0);
    await expect(page.locator(".picker .chip", { hasText: "Classic" }).first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("Learn more opens the library at the selected technique", async ({ page }) => {
    await page.getByRole("button", { name: "Learn more" }).click();
    await expect(page).toHaveURL(/#\/techniques\?focus=classic$/);
    await expect(page.locator(".library-row.is-open")).toContainText("Classic");
  });
});
