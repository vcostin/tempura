import { test, expect } from "@playwright/test";

/**
 * Accessibility checks covering modal focus + announcements (Vite shell).
 * Ported from the PR verification script used during a11y implementation.
 */
test.describe("a11y dialogs and landmarks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".brand");
  });

  test("timer landmarks, announcer, and decorative ring", async ({ page }) => {
    const landmarks = await page.evaluate(() => {
      const header = document.querySelector("header.brand-header");
      const main = document.querySelector("main#timer-main");
      const h1 = document.querySelector("h1.brand");
      const h2 = document.querySelector("h2.phase-label");
      const clock = document.querySelector(".clock");
      const picker = document.querySelector(".picker");
      const announcer = document.querySelector('[role="status"][aria-live="polite"]');
      const ring = document.querySelector(".ring-wrap svg");
      return {
        header: header?.tagName ?? null,
        main: main?.id ?? null,
        h1: h1?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        h2: h2?.textContent?.trim() ?? null,
        clockLive: clock?.getAttribute("aria-live"),
        pickerRole: picker?.getAttribute("role"),
        announcer: Boolean(announcer),
        ringHidden: ring?.getAttribute("aria-hidden"),
      };
    });

    expect(landmarks.header).toBe("HEADER");
    expect(landmarks.main).toBe("timer-main");
    expect(landmarks.h1 ?? "").toContain("Tempura");
    expect(landmarks.h2).toBe("Ready");
    expect(landmarks.clockLive).toBeNull();
    expect(landmarks.pickerRole).toBe("group");
    expect(landmarks.announcer).toBe(true);
    expect(landmarks.ringHidden).toBe("true");
  });

  test("settings dialog: modal, focus trap, Esc restores opener", async ({ page }) => {
    const settingsBtn = page.locator('[data-open-panel="settings"]');
    await settingsBtn.focus();
    await settingsBtn.click();
    await page.waitForSelector('[role="dialog"]');

    const dialog = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const active = document.activeElement as HTMLElement | null;
      const timerInert = document.querySelector(".timer-root")?.hasAttribute("inert");
      return {
        modal: d?.getAttribute("aria-modal"),
        label: d?.getAttribute("aria-label"),
        activeClose: active?.hasAttribute("data-dialog-close"),
        activeLabel: active?.getAttribute("aria-label"),
        timerInert,
      };
    });

    expect(dialog.modal).toBe("true");
    expect(dialog.label).toBe("Settings");
    expect(dialog.activeClose).toBe(true);
    expect(dialog.timerInert).toBe(true);

    await page.keyboard.press("Shift+Tab");
    const afterShiftTab = await page.evaluate(() => {
      const active = document.activeElement;
      const dialogEl = document.querySelector('[role="dialog"]');
      return {
        inside: Boolean(dialogEl && active && dialogEl.contains(active)),
      };
    });
    expect(afterShiftTab.inside).toBe(true);

    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached" });

    const restored = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return {
        opener: active?.getAttribute("data-open-panel"),
        inert: document.querySelector(".timer-root")?.hasAttribute("inert"),
      };
    });
    expect(restored.opener).toBe("settings");
    expect(restored.inert).toBe(false);
  });

  test("stats and guide dialogs open with close focused", async ({ page }) => {
    await page.locator('[data-open-panel="stats"]').click();
    await page.waitForSelector('[role="dialog"]');
    const stats = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const active = document.activeElement as HTMLElement | null;
      return {
        label: d?.getAttribute("aria-label"),
        close: active?.hasAttribute("data-dialog-close"),
      };
    });
    expect(stats.label).toBe("Stats");
    expect(stats.close).toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached" });
    const restoredStats = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.getAttribute("data-open-panel"),
    );
    expect(restoredStats).toBe("stats");

    await page.locator('[data-open-panel="guide"]').click();
    await page.waitForSelector('[role="dialog"]');
    const guide = await page.evaluate(
      () => document.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    );
    expect(guide).toBe("Techniques guide");
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached" });
  });

  test("toolbar About opens About dialog with feedback", async ({ page }) => {
    await page.locator('[data-open-panel="about"]').click();
    await page.waitForSelector('[role="dialog"][aria-label="About"]');
    const aboutToolbar = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      return {
        modal: d?.getAttribute("aria-modal"),
        feedback: Boolean(
          [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Send feedback"),
        ),
      };
    });
    expect(aboutToolbar.modal).toBe("true");
    expect(aboutToolbar.feedback).toBe(true);
    await page.evaluate(() => {
      window.open = () => null;
    });
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByText(/Opened in your browser/)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached" });
  });

  test("settings About link opens About dialog with feedback", async ({ page }) => {
    await page.locator('[data-open-panel="settings"]').click();
    await page.waitForSelector('[role="dialog"]');
    await page.getByRole("button", { name: "About…" }).click();
    await page.waitForSelector('[role="dialog"][aria-label="About"]');

    const about = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const active = document.activeElement as HTMLElement | null;
      return {
        modal: d?.getAttribute("aria-modal"),
        label: d?.getAttribute("aria-label"),
        close: active?.hasAttribute("data-dialog-close"),
        feedback: Boolean(
          [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Send feedback"),
        ),
      };
    });
    expect(about.modal).toBe("true");
    expect(about.label).toBe("About");
    expect(about.close).toBe(true);
    expect(about.feedback).toBe(true);

    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached" });
  });

  test("comma opens settings", async ({ page }) => {
    await page.locator("body").click();
    await page.keyboard.press(",");
    await page.waitForSelector('[role="dialog"]');
    const label = await page.evaluate(
      () => document.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    );
    expect(label).toBe("Settings");
  });
});

test.describe("a11y Phase 3: contrast motion + rem scaling", () => {
  test("prefers-reduced-motion zeros .ring-progress transition", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForSelector(".ring-progress");

    const durationMs = await page.locator(".ring-progress").evaluate((el) => {
      const raw = getComputedStyle(el).transitionDuration;
      // Computed style is a comma-separated list of times like "0s" or "0.01ms".
      const parts = raw.split(",").map((s) => s.trim());
      let maxMs = 0;
      for (const part of parts) {
        if (part.endsWith("ms")) maxMs = Math.max(maxMs, parseFloat(part));
        else if (part.endsWith("s")) maxMs = Math.max(maxMs, parseFloat(part) * 1000);
      }
      return maxMs;
    });

    // Phase 3 CSS: .ring-progress { transition: none } under reduced motion
    // (or the global 0.01ms hammer). Either way duration must be ≤ 1ms.
    expect(durationMs).toBeLessThanOrEqual(1);
  });

  test("html root font-size is not a fixed px lock from our stylesheet", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".brand");

    const info = await page.evaluate(() => {
      const html = document.documentElement;
      // Walk stylesheets for an author html font-size declaration.
      const declared: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // cross-origin
        }
        for (const rule of Array.from(rules)) {
          if (!(rule instanceof CSSStyleRule)) continue;
          if (rule.selectorText.split(",").some((s) => s.trim() === "html")) {
            const fs = rule.style.fontSize;
            if (fs) declared.push(fs);
          }
        }
      }
      return {
        declared,
        computed: getComputedStyle(html).fontSize,
      };
    });

    // Our global.css ships `html { font-size: 100% }` — assert that, not a px lock.
    expect(info.declared.some((v) => v === "100%" || v.endsWith("%"))).toBe(true);
    expect(info.declared.every((v) => !/^\d+(\.\d+)?px$/.test(v))).toBe(true);
  });
});
