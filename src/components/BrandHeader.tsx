import type { ReactNode } from "react";

interface Props {
  /** Short line under the brand — page voice in accent/muted. */
  line: string;
  actions?: ReactNode;
  /** Optional page label shown above the brand line (small caps). */
  eyebrow?: string;
}

/** Shared Tempura brand lockup used on every surface. */
export function BrandHeader({ line, actions, eyebrow }: Props) {
  return (
    <header className="top-bar brand-header">
      <div className="brand-lockup">
        {eyebrow && <p className="brand-eyebrow">{eyebrow}</p>}
        <h1 className="brand">
          Tem<span>pura</span>
        </h1>
        <p className="tagline tagline--accent">{line}</p>
      </div>
      {actions && <div className="brand-actions">{actions}</div>}
    </header>
  );
}
