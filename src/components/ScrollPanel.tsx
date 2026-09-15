import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import { useTranslation } from "react-i18next";
import { useDialogFocus } from "../hooks/useDialogFocus";

interface Props {
  children: ReactNode;
  label?: string;
  className?: string;
}

/** Full-screen modal panel with visible scroll, Tab trap, and initial focus. */
export function ScrollPanel({ children, label, className = "" }: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  useDialogFocus(panelRef);

  function measure() {
    const el = scrollRef.current;
    if (!el) return;
    const overflow = el.scrollHeight > el.clientHeight + 4;
    setCanScroll(overflow);
    setAtBottom(!overflow || el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
  }

  useEffect(() => {
    measure();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [children]);

  function onScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
  }

  const showCue = canScroll && !atBottom;

  return (
    <div
      ref={panelRef}
      className={`panel ${showCue ? "panel--more" : ""} ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
    >
      <div className="panel-scroll" ref={scrollRef} onScroll={onScroll}>
        {children}
      </div>
      {showCue && (
        <div className="scroll-cue" aria-hidden="true">
          <span>{t("scroll.more")}</span>
        </div>
      )}
    </div>
  );
}
