import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Technique } from "../lib/types";
import { techniqueDisplayName, techniqueTooltip } from "../lib/techniqueGuide";
import type { HideBlock } from "../state/techniqueVisibility";

interface Props {
  /** Techniques shown on the timer (hidden ones already left out). */
  techniques: Technique[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Opens the technique editor; stays available while a session runs. */
  onCreate?: () => void;
  disabled?: boolean;
  /** How many techniques are hidden; shows a quiet chip that leads to them. */
  hiddenCount?: number;
  onShowHidden?: () => void;
  /** Chip menu (right-click, Menu key or Shift+F10): hide, and edit for your own. */
  hideBlock?: (id: string) => HideBlock;
  onHide?: (tech: Technique) => void;
  onEdit?: (id: string) => void;
}

interface MenuState {
  tech: Technique;
  top: number;
  left: number;
}

/** Exclusive technique chips as a toggle group (not a listbox). */
export function TechniquePicker(props: Props) {
  const { techniques, selectedId, onSelect, onCreate, disabled } = props;
  const { t } = useTranslation();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const hasMenu = Boolean(props.onHide && props.hideBlock);

  function openMenu(tech: Technique) {
    const chip = chipRefs.current[tech.id];
    if (!chip) return;
    setMenu({ tech, top: chip.offsetTop + chip.offsetHeight + 4, left: chip.offsetLeft });
  }

  function closeMenu(refocus: boolean) {
    const id = menu?.tech.id;
    setMenu(null);
    if (refocus && id) chipRefs.current[id]?.focus();
  }

  // Keep the menu inside the picker, then focus its first usable item.
  useLayoutEffect(() => {
    const el = menuRef.current;
    const picker = pickerRef.current;
    if (!el || !picker || !menu) return;
    const maxLeft = Math.max(0, picker.clientWidth - el.offsetWidth);
    el.style.left = `${Math.min(menu.left, maxLeft)}px`;
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

  // Nothing to act on once a session starts or the chip goes away.
  useEffect(() => {
    if (menu && (disabled || !techniques.some((tech) => tech.id === menu.tech.id))) setMenu(null);
  }, [menu, disabled, techniques]);

  function onChipKey(e: KeyboardEvent<HTMLButtonElement>, tech: Technique) {
    if (!hasMenu) return;
    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      openMenu(tech);
    }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === "Tab") {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : items.length - 1;
      items[(index + step) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  }

  const block = menu && props.hideBlock ? props.hideBlock(menu.tech.id) : null;

  return (
    <div className="picker" role="group" aria-label={t("picker.aria")} ref={pickerRef}>
      {techniques.map((tech) => (
        <button
          key={tech.id}
          ref={(el) => {
            chipRefs.current[tech.id] = el;
          }}
          type="button"
          className="chip"
          aria-pressed={tech.id === selectedId}
          aria-haspopup={hasMenu && !disabled ? "menu" : undefined}
          disabled={disabled}
          onClick={() => onSelect(tech.id)}
          onContextMenu={(e) => {
            if (!hasMenu) return;
            e.preventDefault();
            openMenu(tech);
          }}
          onKeyDown={(e) => onChipKey(e, tech)}
          title={techniqueTooltip(tech)}
        >
          {techniqueDisplayName(tech)}
        </button>
      ))}
      {props.hiddenCount !== undefined && props.hiddenCount > 0 && props.onShowHidden && (
        <button
          type="button"
          className="chip chip-hidden"
          data-open-panel="techniques"
          aria-haspopup="dialog"
          aria-label={t("picker.hiddenAria", { n: props.hiddenCount })}
          title={t("picker.hiddenAria", { n: props.hiddenCount })}
          onClick={props.onShowHidden}
        >
          {t("picker.hidden", { n: props.hiddenCount })}
        </button>
      )}
      {onCreate && (
        <button
          type="button"
          className="chip chip-add"
          data-open-panel="technique-new"
          aria-haspopup="dialog"
          aria-label={t("picker.newTechnique")}
          title={t("picker.newTechnique")}
          onClick={onCreate}
        >
          <span aria-hidden="true">+</span>
        </button>
      )}
      {menu && (
        <div
          ref={menuRef}
          className="chip-menu"
          role="menu"
          aria-label={techniqueDisplayName(menu.tech)}
          style={{ top: menu.top, left: menu.left }}
          onKeyDown={onMenuKey}
        >
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={block ? true : undefined}
            aria-describedby={block ? "chip-menu-hint" : undefined}
            onClick={() => {
              if (block) return;
              const tech = menu.tech;
              closeMenu(false);
              props.onHide?.(tech);
              // The chip is gone; land on the picker's selected chip instead.
              chipRefs.current[selectedId]?.focus();
            }}
          >
            {t("picker.hide")}
          </button>
          {menu.tech.kind === "custom" && props.onEdit && (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                const id = menu.tech.id;
                closeMenu(false);
                props.onEdit?.(id);
              }}
            >
              {t("library.edit")}
            </button>
          )}
          {block && (
            <p className="chip-menu-hint" id="chip-menu-hint">
              {block === "selected" ? t("picker.keepSelected") : t("picker.keepOne")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
