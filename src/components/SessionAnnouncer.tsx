import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { sessionAnnounceKind } from "../lib/sessionAnnounce";
import type { TimerSnapshot } from "../lib/types";

interface Props {
  snapshot: TimerSnapshot;
}

/** Polite live region for phase / pause / resume / stop — not the ticking clock. */
export function SessionAnnouncer({ snapshot }: Props) {
  const { t } = useTranslation();
  const prevRef = useRef<TimerSnapshot | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const kind = sessionAnnounceKind(prevRef.current, snapshot);
    prevRef.current = snapshot;
    if (!kind) return;

    const next = t(`announce.${kind}`);
    setMessage("");
    const id = window.requestAnimationFrame(() => setMessage(next));
    return () => window.cancelAnimationFrame(id);
  }, [snapshot, t]);

  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
