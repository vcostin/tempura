import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** In-DOM listbox so bundled fonts apply. Native <select> popups use GTK fonts on Linux. */
export function Select({ id, value, options, onChange, disabled }: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const [highlighted, setHighlighted] = useState(selectedIndex);

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? "";

  const close = useCallback(() => setOpen(false), []);

  const pick = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
      buttonRef.current?.focus();
    },
    [onChange],
  );

  useEffect(() => {
    if (open) setHighlighted(selectedIndex);
  }, [open, selectedIndex]);

  useLayoutEffect(() => {
    if (!open) return;
    const btn = buttonRef.current;
    if (!btn) return;

    function place() {
      const trigger = buttonRef.current;
      const list = menuRef.current;
      if (!trigger || !list) return;
      const r = trigger.getBoundingClientRect();
      const maxH = 280;
      const spaceBelow = window.innerHeight - r.bottom - 12;
      const spaceAbove = r.top - 12;
      const openUp = spaceBelow < 120 && spaceAbove > spaceBelow;
      const height = Math.min(maxH, Math.max(96, openUp ? spaceAbove : spaceBelow));
      list.style.position = "fixed";
      list.style.zIndex = "80";
      list.style.left = `${r.left}px`;
      list.style.width = `${r.width}px`;
      list.style.maxHeight = `${height}px`;
      if (openUp) {
        list.style.top = "auto";
        list.style.bottom = `${window.innerHeight - r.top + 6}px`;
      } else {
        list.style.bottom = "auto";
        list.style.top = `${r.bottom + 6}px`;
      }
    }

    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const node = e.target as Node;
      if (rootRef.current?.contains(node) || menuRef.current?.contains(node)) return;
      close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    const active = menuRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setHighlighted(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setHighlighted(options.length - 1);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const opt = options[highlighted];
      if (opt) pick(opt.value);
    }
  }

  const activeId = open && options[highlighted] ? `${listId}-${highlighted}` : undefined;

  return (
    <div className="select" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        className="select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={activeId}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
      >
        <span className="select-value" dir="auto">
          {label}
        </span>
      </button>
      {open &&
        createPortal(
          <ul
            ref={menuRef}
            id={listId}
            className="select-menu"
            role="listbox"
            tabIndex={-1}
          >
            {options.map((opt, index) => (
              <li
                key={opt.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={opt.value === value}
                data-active={index === highlighted ? "true" : undefined}
                className="select-option"
                onMouseEnter={() => setHighlighted(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(opt.value)}
              >
                <span dir="auto">{opt.label}</span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
