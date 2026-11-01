import { test, expect, type Page } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/** Opt-in global shortcuts in Settings: recorder, clear, conflicts, Wayland portal and commands. */
test.describe("global shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".rhythm-card");
  });

  const openSettings = async (page: Page) => {
    await page.locator('[data-open-panel="settings"]').click();
    await expect(page.getByRole("heading", { name: "Global shortcuts" })).toBeVisible();
  };
  const row = (page: Page, label: string) => page.locator(".hotkey-row", { hasText: label });
  const setReport = (page: Page, report: Record<string, unknown>) =>
    page.evaluate((r) => (window as any).__tempuraMock.setHotkeyReport(r), report);

  test("none are set by default; record one, then clear it", async ({ page }) => {
    await openSettings(page);
    await expect(page.locator(".hotkey-recorder")).toHaveText(["Not set", "Not set", "Not set"]);

    const recorder = row(page, "Start, pause or resume").locator(".hotkey-recorder");
    await recorder.click();
    await expect(recorder).toHaveText("Press a shortcut… (Esc to cancel)");
    await page.keyboard.press("Control+Alt+KeyP");
    await expect(recorder.locator("kbd")).toHaveText(["Ctrl", "Alt", "P"]);
    expect(await page.evaluate(() => (window as any).__tempuraMock.calls)).toContain("update_settings");

    await page.getByRole("button", { name: "Clear the shortcut for Start, pause or resume" }).click();
    await expect(recorder).toHaveText("Not set");
  });

  test("keys without Ctrl, Alt or Super are refused, and Esc cancels without closing Settings", async ({ page }) => {
    await openSettings(page);
    const recorder = row(page, "Skip to the next phase").locator(".hotkey-recorder");
    await recorder.click();
    await page.keyboard.press("Shift+KeyS");
    await expect(row(page, "Skip to the next phase").getByRole("status")).toHaveText(
      "Add Ctrl, Alt or Super, so typing in other apps isn’t affected.",
    );
    await page.keyboard.press("Escape");
    await expect(recorder).toHaveText("Not set");
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  });

  test("the same shortcut can't serve two actions", async ({ page }) => {
    await openSettings(page);
    await row(page, "Start, pause or resume").locator(".hotkey-recorder").click();
    await page.keyboard.press("Control+Alt+KeyP");
    await row(page, "Show or hide Tempura").locator(".hotkey-recorder").click();
    await page.keyboard.press("Control+Alt+KeyP");
    await expect(row(page, "Show or hide Tempura").getByRole("status")).toHaveText(
      "Already used for “Start, pause or resume”.",
    );
  });

  test("a shortcut another app owns is reported, not taken", async ({ page }) => {
    await setReport(page, { inUse: ["toggle"] });
    await openSettings(page);
    await expect(row(page, "Start, pause or resume").getByRole("status")).toHaveText(
      "Another app already uses this shortcut, so Tempura left it alone. Pick another.",
    );
  });

  test("on Wayland without a portal, Settings lists the commands to bind instead", async ({ page }) => {
    await setReport(page, { mode: "commands", command: "/opt/Tempura.AppImage" });
    await page.locator('[data-open-panel="settings"]').click();
    await expect(page.locator(".hotkey-recorder")).toHaveCount(0);
    await expect(page.locator(".hotkey-commands code")).toHaveText([
      "/opt/Tempura.AppImage --toggle",
      "/opt/Tempura.AppImage --skip",
      "/opt/Tempura.AppImage --show",
    ]);
  });

  test("on Wayland, each command has a copy button", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await setReport(page, { mode: "commands", command: "/opt/Tempura.AppImage" });
    await page.locator('[data-open-panel="settings"]').click();
    const copy = page.getByRole("button", { name: "Copy the command for Skip to the next phase" });
    await copy.click();
    await expect(copy).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("/opt/Tempura.AppImage --skip");
  });

  test("with a portal, the desktop's dialog assigns the keys; turning off releases them", async ({ page }) => {
    await setReport(page, { mode: "portal" });
    await openSettings(page);
    await expect(page.locator(".hotkey-recorder")).toHaveCount(0);
    await expect(page.locator(".hotkey-row")).toHaveCount(0);

    await page.getByRole("button", { name: "Set up shortcuts…" }).click();
    await expect(page.locator(".hotkey-row")).toHaveText([
      /Start, pause or resume\s*Ctrl\+Alt\+P/,
      /Skip to the next phase\s*Not set/,
      /Show or hide Tempura\s*Super\+T/,
    ]);
    const calls = await page.evaluate(() => (window as any).__tempuraMock.calls as string[]);
    expect(calls).toContain("setup_portal_hotkeys");
    expect(calls).toContain("update_settings");

    // Each key is a button that opens the desktop's editor again.
    await page.getByRole("button", { name: "Skip to the next phase Not set" }).click();
    await expect
      .poll(async () =>
        (await page.evaluate(() => (window as any).__tempuraMock.calls as string[])).filter(
          (c) => c === "setup_portal_hotkeys",
        ).length,
      )
      .toBe(2);

    await page.getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByRole("button", { name: "Set up shortcuts…" })).toBeVisible();
    await expect(page.locator(".hotkey-row")).toHaveCount(0);
  });

  test("with a portal, a cancelled dialog leaves shortcuts off and says so", async ({ page }) => {
    await setReport(page, { mode: "portal" });
    await page.evaluate(() => (window as any).__tempuraMock.setPortalAssigns(null));
    await openSettings(page);
    await page.getByRole("button", { name: "Set up shortcuts…" }).click();
    await expect(page.locator(".hotkey-problem")).toHaveText(
      "The desktop didn't add the shortcuts. Try again, or use the commands below.",
    );
    await expect(page.getByRole("button", { name: "Set up shortcuts…" })).toBeVisible();
    await page.getByText("Use commands instead").click();
    await expect(page.locator(".hotkey-commands code")).toHaveCount(3);
  });

  test("the shortcuts page lists portal-assigned keys under System-wide", async ({ page }) => {
    await setReport(page, { mode: "portal" });
    await openSettings(page);
    await page.getByRole("button", { name: "Set up shortcuts…" }).click();
    await expect(page.locator(".hotkey-row")).toHaveCount(3);
    await page.getByRole("button", { name: "Keyboard shortcuts…" }).click();
    const systemWide = page.locator(".section", { has: page.getByRole("heading", { name: "System-wide" }) });
    await expect(systemWide.locator(".shortcut-row")).toHaveText([
      /Ctrl\+Alt\+P\s*Start, pause or resume/,
      /Super\+T\s*Show or hide Tempura/,
    ]);
  });

  test("the shortcuts page lists recorded ones under System-wide", async ({ page }) => {
    await openSettings(page);
    await row(page, "Show or hide Tempura").locator(".hotkey-recorder").click();
    await page.keyboard.press("Control+Alt+KeyT");
    await page.getByRole("button", { name: "Keyboard shortcuts…" }).click();
    const systemWide = page.locator(".section", { has: page.getByRole("heading", { name: "System-wide" }) });
    await expect(systemWide.locator(".shortcut-row")).toHaveText([/Ctrl\s*\+\s*Alt\s*\+\s*T\s*Show or hide Tempura/]);
  });
});
