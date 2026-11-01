import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { formatTechniqueRhythm } from "../lib/api";
import { rhythmNumbers } from "../lib/rhythm";
import { guideForTechnique, techniqueDisplayName } from "../lib/techniqueGuide";
import type { Technique } from "../lib/types";
import type { HideBlock } from "../state/techniqueVisibility";
import { RhythmStrip } from "./RhythmStrip";

interface Props {
  /** Techniques shown on the timer (hidden ones already left out). */
  techniques: Technique[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onCreate: () => void;
  onManage: () => void;
  /** How many techniques are hidden; a quiet button leads to them. */
  hiddenCount: number;
  onShowHidden: () => void;
  /** Row menu (right-click, Menu key or Shift+F10): hide, and edit for your own. */
  hideBlock: (id: string) => HideBlock;
  onHide: (tech: Technique) => void;
  onEdit: (id: string) => void;
}

interface MenuState {
  tech: Technique;
  top: number;
}

/** Keys the timer acts on; inside the sheet they belong to the sheet. */
const TIMER_KEYS = new Set([" ", "s", "S", ",", "?"]);

/**
 * Every technique on the timer with its shape, to compare and pick from. Your own
 * come first. A modal dialog holding a listbox: arrows move, Enter or a click picks
 * and closes, Esc closes.
 */
export function TechniqueSheet(props: Props) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [focusedId, setFocusedId] = useState(props.selectedId);
  useDialogFocus(sheetRef);

  const mine = props.techniques.filter((tech) => tech.kind === "custom");
  const builtIn = props.techniques.filter((tech) => tech.kind !== "custom");
  const order = [...mine, ...builtIn];
  const grouped = mine.length > 0;
  const tabStop = order.some((tech) => tech.id === focusedId) ? focusedId : props.selectedId;

  function option(id: string) {
    return listRef.current?.querySelector<HTMLElement>(`[data-technique-id="${CSS.escape(id)}"]`) ?? null;
  }

  function moveTo(id: string | undefined) {
    if (!id) return;
    setFocusedId(id);
    option(id)?.focus();
  }

  function openMenu(tech: Technique) {
    const row = option(tech.id);
    if (!row) return;
    setMenu({ tech, top: row.offsetTop + row.offsetHeight - 6 });
  }

  function closeMenu(refocus: boolean) {
    const id = menu?.tech.id;
    setMenu(null);
    if (refocus && id) option(id)?.focus();
  }

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el || !menu) return;
    // Disabled items stay focusable so their hint is still read out.
    (
      el.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ??
      el.querySelector<HTMLElement>('[role="menuitem"]')
    )?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    function onPointer(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    }
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [menu]);

  function onSheetKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (menu) closeMenu(true);
      else props.onClose();
      return;
    }
    if (TIMER_KEYS.has(e.key) && !e.ctrlKey && !e.metaKey) e.stopPropagation();
  }

  function onOptionKey(e: KeyboardEvent<HTMLDivElement>, tech: Technique) {
    const i = order.findIndex((x) => x.id === tech.id);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      moveTo(order[Math.min(order.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))]?.id);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      moveTo((e.key === "Home" ? order[0] : order[order.length - 1])?.id);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      props.onSelect(tech.id);
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      openMenu(tech);
    }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Tab") {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const step = e.key === "ArrowDown" ? 1 : items.length - 1;
      items[(index + step) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      e.stopPropagation();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  }

  const block = menu ? props.hideBlock(menu.tech.id) : null;

  function renderOption(tech: Technique) {
    const selected = tech.id === props.selectedId;
    const numbers = rhythmNumbers(tech);
    const guide = guideForTechnique(tech);
    return (
      <div
        key={tech.id}
        role="option"
        className="sheet-option"
        data-technique-id={tech.id}
        aria-selected={selected}
        aria-haspopup="menu"
        tabIndex={tech.id === tabStop ? 0 : -1}
        data-autofocus={selected ? "" : undefined}
        onClick={() => props.onSelect(tech.id)}
        onFocus={() => setFocusedId(tech.id)}
        onKeyDown={(e) => onOptionKey(e, tech)}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenu(tech);
        }}
      >
        <span className="sheet-radio" aria-hidden="true" />
        <span className="sheet-option-head">
          <span className="sheet-option-name">{techniqueDisplayName(tech)}</span>
          <span className="sheet-option-numbers" aria-hidden="true">
            {numbers ?? t("rhythm.openEnded")}
          </span>
          <span className="visually-hidden">{formatTechniqueRhythm(tech)}</span>
        </span>
        <RhythmStrip technique={tech} />
        <span className="sheet-option-best">{guide.bestFor}</span>
      </div>
    );
  }

  return (
    <div className="sheet-layer" onKeyDown={onSheetKey}>
      <div className="sheet-scrim" aria-hidden="true" onClick={props.onClose} />
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        aria-describedby="sheet-line"
      >
        <div className="sheet-head">
          <div>
            <h2 id="sheet-title" className="sheet-title">
              {t("rhythm.sheetTitle")}
            </h2>
            <p id="sheet-line" className="sheet-line">
              {t("rhythm.sheetLine")}
            </p>
          </div>
          <button type="button" className="icon-btn sheet-close" aria-label={t("library.close")} onClick={props.onClose}>
            ✕
          </button>
        </div>

        {/* The menu sits beside the listbox, not in it, and scrolls along with it. */}
        <div className="sheet-scroll">
          <div className="sheet-list" ref={listRef} role="listbox" aria-labelledby="sheet-title">
            {grouped ? (
              <>
                <div role="group" aria-labelledby="sheet-mine">
                  <p id="sheet-mine" className="sheet-group" role="presentation">
                    {t("library.tabMine")}
                  </p>
                  {mine.map(renderOption)}
                </div>
                <div role="group" aria-labelledby="sheet-builtin">
                  <p id="sheet-builtin" className="sheet-group" role="presentation">
                    {t("library.tabBuiltIn")}
                  </p>
                  {builtIn.map(renderOption)}
                </div>
              </>
            ) : (
              builtIn.map(renderOption)
            )}
          </div>

          {menu && (
            <div
              ref={menuRef}
              className="chip-menu sheet-menu"
              role="menu"
              aria-label={techniqueDisplayName(menu.tech)}
              style={{ top: menu.top }}
              onKeyDown={onMenuKey}
            >
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={block ? true : undefined}
                aria-describedby={block ? "sheet-menu-hint" : undefined}
                onClick={() => {
                  if (block) return;
                  const tech = menu.tech;
                  setMenu(null);
                  props.onHide(tech);
                  // The row is gone; land on the selected one instead.
                  moveTo(props.selectedId);
                }}
              >
                {t("picker.hide")}
              </button>
              {menu.tech.kind === "custom" && (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    const id = menu.tech.id;
                    setMenu(null);
                    props.onEdit(id);
                  }}
                >
                  {t("library.edit")}
                </button>
              )}
              {block && (
                <p className="chip-menu-hint" id="sheet-menu-hint">
                  {block === "selected" ? t("picker.keepSelected") : t("picker.keepOne")}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="sheet-actions">
          {props.hiddenCount > 0 && (
            <button
              type="button"
              className="linkish sheet-hidden"
              aria-label={t("picker.hiddenAria", { n: props.hiddenCount })}
              onClick={props.onShowHidden}
            >
              {t("picker.hidden", { n: props.hiddenCount })}
            </button>
          )}
          <div className="sheet-buttons">
            <button type="button" className="btn btn-ghost" data-open-panel="technique-new" onClick={props.onCreate}>
              <span aria-hidden="true">+ </span>
              {t("picker.newTechnique")}
            </button>
            <button type="button" className="btn btn-ghost" data-open-panel="techniques" onClick={props.onManage}>
              {t("settings.manageTechniques")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
