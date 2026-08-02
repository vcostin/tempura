import { useEffect, useRef, useState, type ReactNode, type UIEvent } from "react";

interface Props {
  children: ReactNode;
  label?: string;
  className?: string;
}

/** Full-screen panel with visible scroll + bottom “more” cue. */
export function ScrollPanel({ children, label, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  function measure() {
    const el = ref.current;
    if (!el) return;
    const overflow = el.scrollHeight > el.clientHeight + 4;
    setCanScroll(overflow);
    setAtBottom(!overflow || el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
  }

  useEffect(() => {
    measure();
    const el = ref.current;
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
      className={`panel ${showCue ? "panel--more" : ""} ${className}`.trim()}
      role="dialog"
      aria-label={label}
    >
      <div className="panel-scroll" ref={ref} onScroll={onScroll}>
        {children}
      </div>
      {showCue && (
        <div className="scroll-cue" aria-hidden="true">
          <span>Scroll for more</span>
        </div>
      )}
    </div>
  );
}
