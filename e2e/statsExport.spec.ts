import { test, expect } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/** The stats page saves every session as CSV or JSON through the backend's save dialog. */
test.describe("stats: export", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".picker .chip");
    await page.locator('[data-open-panel="stats"]').click();
  });

  const exportSection = (page: import("@playwright/test").Page) =>
    page.getByRole("region", { name: "Export" });

  test("saves as CSV or JSON and names the file", async ({ page }) => {
    await exportSection(page).getByRole("button", { name: "Save as CSV" }).click();
    await expect(page.locator(".toast")).toHaveText("Saved tempura-sessions.csv");

    await exportSection(page).getByRole("button", { name: "Save as JSON" }).click();
    await expect(page.locator(".toast")).toHaveText("Saved tempura-sessions.json");
  });

  test("says nothing when the dialog is cancelled", async ({ page }) => {
    await page.evaluate(() => (window as any).__tempuraMock.setExportResult(null));
    await exportSection(page).getByRole("button", { name: "Save as CSV" }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__tempuraMock.calls)).toContain(
      "export_sessions",
    );
    await expect(page.locator(".toast")).toHaveCount(0);
    await expect(exportSection(page).getByRole("button", { name: "Save as CSV" })).toBeEnabled();
  });

  test("tells the user when the file couldn't be written", async ({ page }) => {
    await page.evaluate(() =>
      (window as any).__tempuraMock.setExportResult({ error: "Permission denied" }),
    );
    await exportSection(page).getByRole("button", { name: "Save as JSON" }).click();
    await expect(page.locator(".toast")).toHaveText("Couldn't save the export");
  });
});
