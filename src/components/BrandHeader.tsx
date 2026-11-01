import type { ReactNode } from "react";

interface Props {
  /** The line under the wordmark: the timer's tagline, or a panel's name. */
  line: string;
  actions?: ReactNode;
  /** Out of reach while a sheet covers the page. */
  inert?: boolean;
}

/**
 * The Tempura lockup at the top of every surface: the wordmark, one line under it
 * (on panels, the panel's name), and the actions at the end. Same height everywhere,
 * so the wordmark never jumps when a panel opens.
 */
export function BrandHeader({ line, actions, inert }: Props) {
  return (
    <header className="top-bar brand-header" inert={inert || undefined}>
      <div className="brand-lockup">
        <h1 className="brand">
          Tem<span>pura</span>
        </h1>
        <p className="tagline tagline--accent">{line}</p>
      </div>
      {actions && <div className="brand-actions">{actions}</div>}
    </header>
  );
}
