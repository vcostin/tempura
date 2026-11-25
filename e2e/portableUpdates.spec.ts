import { test, expect, type Page } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/**
 * The Windows portable exe never runs an installer. It checks its own entry in
 * latest.json and says a newer version is out; "Update & restart" replaces its own
 * file only when the user turns that on, otherwise the button opens the download page.
 */
async function openAbout(page: Page, portable: boolean) {
  await installTauriMock(page, { portable });
  // A newer version is out.
  await page.addInitScript(() => {
    const internals = (window as any).__TAURI_INTERNALS__;
    const invoke = internals.invoke;
    internals.invoke = (cmd: string, args: unknown) =>
      cmd === "plugin:updater|check"
        ? invoke(cmd, args).then(() => ({ rid: 1, currentVersion: "0.0.0-test", version: "9.9.9", rawJson: {} }))
        : invoke(cmd, args);
  });
  await page.goto("/");
  await page.locator('[data-open-panel="about"]').click();
  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect(page.getByText("Version 9.9.9 is ready.")).toBeVisible();
}

const argsOf = (page: Page, name: string) =>
  page.evaluate(
    (name) => ((window as any).__tempuraMock.argsLog as [string, any][]).filter(([cmd]) => cmd === name).map(([, a]) => a),
    name,
  );
const calls = (page: Page) => page.evaluate(() => (window as any).__tempuraMock.calls as string[]);

test("portable: checks its own entry, and Download opens the page until in-place updates are on", async ({ page }) => {
  await openAbout(page, true);
  expect((await argsOf(page, "plugin:updater|check"))[0]?.target).toBe("windows-x86_64-portable");

  const swap = page.getByRole("switch", { name: "Update this portable copy in place" });
  await expect(swap).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await expect.poll(() => calls(page)).toContain("open_download_page");
  expect(await calls(page)).not.toContain("install_portable_update");

  await swap.click();
  await expect(swap).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Update & restart" }).click();
  await expect.poll(() => calls(page)).toContain("install_portable_update");
});

test("installed: no portable switch, and the usual installer entry", async ({ page }) => {
  await openAbout(page, false);
  expect((await argsOf(page, "plugin:updater|check"))[0]?.target).toBeUndefined();
  await expect(page.getByRole("switch", { name: "Update this portable copy in place" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Update & restart" })).toBeVisible();
});
