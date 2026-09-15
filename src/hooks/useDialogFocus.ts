import { useLayoutEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return false;
    if (el.getClientRects().length === 0) return false;
    return true;
  });
}

function firstControl(container: HTMLElement): HTMLElement {
  const closeBtn = container.querySelector<HTMLElement>("[data-dialog-close]");
  if (closeBtn) return closeBtn;
  const heading = container.querySelector<HTMLElement>("h1, h2");
  if (heading) {
    if (heading.tabIndex < 0) heading.tabIndex = -1;
    return heading;
  }
  return getFocusable(container)[0] ?? container;
}

/**
 * Dialog keyboard behavior: move focus to a sensible first control on open,
 * and keep Tab cycling inside the container while it is mounted.
 */
export function useDialogFocus(containerRef: RefObject<HTMLElement | null>, active = true) {
  useLayoutEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;
    const root: HTMLElement = el;

    const initial = firstControl(root);
    initial.focus({ preventScroll: true, focusVisible: true } as FocusOptions);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = getFocusable(root);
      if (focusable.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;
      const inside = activeEl instanceof Node && root.contains(activeEl);

      if (e.shiftKey) {
        if (!inside || activeEl === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, containerRef]);
}
