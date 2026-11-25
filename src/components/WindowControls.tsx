import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { windowChrome } from "../lib/platform";
import { CloseIcon } from "./CloseIcon";

/**
 * The window's own title bar, since the system one is off. A strip across the top
 * drags the window. On Linux and Windows two small buttons in the top corner
 * minimize and close it. Close goes through the same close request as the system
 * button, so it still hides to the tray. On macOS the system's traffic lights sit
 * over the strip instead. Linux draws the window's rounded corners itself, and squares
 * them while the window is maximized. The shrimp mark sits in the opposite corner,
 * where the system bar showed the app icon; a click or right-click on it opens the
 * window menu.
 */
export function WindowControls() {
  const { t } = useTranslation();
  const chrome = windowChrome();
  const markRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (chrome !== "linux") return;
    const win = getCurrentWindow();
    const root = document.documentElement;
    const sync = async () => {
      root.dataset.maximized = String((await win.isMaximized().catch(() => false)) === true);
    };
    void sync();
    let unlisten: (() => void) | undefined;
    let gone = false;
    void win.onResized(() => void sync()).then((u) => (gone ? u() : (unlisten = u)));
    return () => {
      gone = true;
      unlisten?.();
    };
  }, [chrome]);

  if (chrome === "native") return null;

  return (
    <>
      <div className="window-drag-strip" data-tauri-drag-region aria-hidden="true" />
      {chrome !== "mac" && (
        <button
          ref={markRef}
          type="button"
          className="window-mark"
          aria-label={t("window.menu")}
          title={menuOpen ? undefined : t("window.menu")}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenuOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setMenuOpen(true);
            }
          }}
        >
          <ShrimpMark />
        </button>
      )}
      {menuOpen && (
        <WindowMenu
          markRef={markRef}
          onClose={(refocus) => {
            setMenuOpen(false);
            if (refocus) markRef.current?.focus();
          }}
        />
      )}
      {chrome !== "mac" && (
        <div className="window-controls">
          <button
            type="button"
            className="window-btn"
            aria-label={t("window.minimize")}
            title={t("window.minimize")}
            onClick={() => void getCurrentWindow().minimize()}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
              <path d="M6 12h12" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="window-btn window-btn--close"
            aria-label={t("window.close")}
            title={t("window.close")}
            onClick={() => void getCurrentWindow().close()}
          >
            <CloseIcon size={12} />
          </button>
        </div>
      )}
    </>
  );
}

/**
 * What the system title bar's menu offered. Drawn in the page: a native popup menu
 * on GTK holds a pointer grab, and when something else takes the screen (a screenshot
 * tool) the grab can outlive the menu and leave the window deaf to clicks.
 */
function WindowMenu({
  markRef,
  onClose,
}: {
  markRef: React.RefObject<HTMLButtonElement | null>;
  onClose: (refocus: boolean) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ maximized: boolean; onTop: boolean | null } | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    let live = true;
    void Promise.all([
      win.isMaximized().catch(() => false),
      invoke<boolean>("window_can_stay_on_top").catch(() => false),
      win.isAlwaysOnTop().catch(() => false),
    ]).then(([maximized, canStay, onTop]) => {
      if (live) setState({ maximized: maximized === true, onTop: canStay ? onTop === true : null });
    });
    return () => {
      live = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (state) ref.current?.querySelector<HTMLElement>("[role^='menuitem']")?.focus();
  }, [state]);

  useEffect(() => {
    function onPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !markRef.current?.contains(target)) onClose(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("blur", onBlur);
    function onBlur() {
      onClose(false);
    }
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("blur", onBlur);
    };
  }, [onClose, markRef]);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role^='menuitem']") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const step = e.key === "ArrowDown" ? 1 : items.length - 1;
      items[(index + step) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      e.stopPropagation();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (e.key === " " || e.key === "Enter") {
      // Keep Space off the timer; the focused item clicks itself.
      e.stopPropagation();
    }
  }

  if (!state) return null;
  const win = getCurrentWindow();
  const run = (action: () => Promise<unknown>) => () => {
    onClose(false);
    void action();
  };

  return (
    <div ref={ref} className="chip-menu window-menu" role="menu" aria-label={t("window.menu")} onKeyDown={onKey}>
      <button type="button" role="menuitem" tabIndex={-1} onClick={run(() => win.minimize())}>
        {t("window.minimize")}
      </button>
      <button type="button" role="menuitem" tabIndex={-1} onClick={run(() => win.toggleMaximize())}>
        {state.maximized ? t("window.restore") : t("window.maximize")}
      </button>
      {state.onTop !== null && (
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={state.onTop}
          tabIndex={-1}
          onClick={run(() => win.setAlwaysOnTop(!state.onTop))}
        >
          <span className="window-menu-check" aria-hidden="true">
            {state.onTop ? "✓" : ""}
          </span>
          {t("window.alwaysOnTop")}
        </button>
      )}
      <div className="window-menu-sep" role="separator" />
      <button type="button" role="menuitem" tabIndex={-1} onClick={run(() => win.close())}>
        {t("window.close")}
      </button>
    </div>
  );
}

/** The app icon's shrimp (assets/tray-shrimp.svg), without the squircle. */
function ShrimpMark() {
  return (
    <svg width={18} height={18} viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <path
        fill="#C47A2C"
        d="M30.414 9.28c-2.266-3.135-6.545-6.934-14.066-7.232l-.372-.015-.126.35c-.063.176-.302.519-.532.851-.679.979-1.609 2.319-1.212 3.52.221.669.814 1.17 1.764 1.491 1.893.639 5.829 3.862 6.602 7.745.215 1.076.155 2.111-.144 3.105-1.624-3.031-4.566-4.938-8.158-4.938-5.814 0-9.527 4.787-9.527 10.67 0 5.082 3.713 10.671 9.527 10.671.029 0 .058-.004.086-.004l.091.006c.602.043 1.608.113 2.826.113 6.086 0 13.838-1.729 16.201-9.968 1.554-5.419.421-11.69-2.96-16.365z"
      />
      <path
        fill="none"
        stroke="#B85A6A"
        strokeWidth="1.55"
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M20.896 3.385c-.043-.434-.357-.791-.782-.889C18.519 2.128 7.344.435 4.96.435l-.195.003c-1.421.065-2.507.79-2.768 1.848-.123.498-.209 1.771 1.624 2.84.551.322.887.661.899.908.01.235-.261.712-1.062 1.283-.794.567-1.119 1.442-.85 2.284.331 1.033 1.467 1.728 2.828 1.728.744 0 1.513-.196 2.285-.582 1.996-.999 4.682-1.643 6.844-1.643 1.066 0 1.971.15 2.689.445.362.149.717.225 1.053.225.619 0 1.965-.2 1.6-.722-2.647-3.787 1.059-4.98.989-5.667z"
      />
    </svg>
  );
}
