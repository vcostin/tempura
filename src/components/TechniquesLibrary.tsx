import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatTechniqueRhythm } from "../lib/api";
import { guideForTechnique, techniqueDisplayName } from "../lib/techniqueGuide";
import type { Technique } from "../lib/types";
import type { HideBlock } from "../state/techniqueVisibility";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";

export type LibraryTab = "mine" | "builtin";

interface Props {
  techniques: Technique[];
  selectedId: string;
  /** A session is running, so switching technique is off. */
  running: boolean;
  /** Row to expand and scroll to (e.g. from the timer's "Learn more"). */
  focusId?: string;
  /** Tab to open on; otherwise Mine when you have custom techniques. */
  tab?: LibraryTab;
  onTabChange: (tab: LibraryTab) => void;
  /** Opened from the timer's hidden chip: hidden techniques come first. */
  showHidden?: boolean;
  isHidden: (id: string) => boolean;
  hideBlock: (id: string) => HideBlock;
  onSetHidden: (tech: Technique, hidden: boolean) => void;
  onUse: (id: string) => void;
  onNew: () => void;
  onEdit: (id: string) => void;
  onDelete: (tech: Technique) => void;
  onCustomize: (id: string) => void;
  onClose: () => void;
}

const TABS: LibraryTab[] = ["mine", "builtin"];

/** Every technique in one place: yours first, then the built-ins, as compact rows. */
export function TechniquesLibrary(props: Props) {
  const { t } = useTranslation();
  const customs = props.techniques.filter((tech) => tech.kind === "custom");
  const builtIns = props.techniques.filter((tech) => tech.kind === "system");
  const focused = props.focusId
    ? props.techniques.find((tech) => tech.id === props.focusId)
    : undefined;
  const firstHidden = props.showHidden
    ? [...customs, ...builtIns].find((tech) => props.isHidden(tech.id))
    : undefined;
  const [tab, setTab] = useState<LibraryTab>(() => {
    if (focused) return focused.kind === "custom" ? "mine" : "builtin";
    if (firstHidden) return firstHidden.kind === "custom" ? "mine" : "builtin";
    return props.tab ?? (customs.length > 0 ? "mine" : "builtin");
  });
  const [expandedId, setExpandedId] = useState<string | null>(focused?.id ?? null);
  const tabRefs = useRef<Record<LibraryTab, HTMLButtonElement | null>>({ mine: null, builtin: null });

  // Before paint, so the list doesn't show at the top and then jump.
  useLayoutEffect(() => {
    props.onTabChange(tab);
    if (!focused) return;
    document
      .getElementById(`tech-${focused.id}`)
      ?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, []);

  function selectTab(next: LibraryTab) {
    setTab(next);
    props.onTabChange(next);
  }

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    e.preventDefault();
    const rtl = document.documentElement.dir === "rtl";
    let index = TABS.indexOf(tab);
    if (e.key === "Home") index = 0;
    else if (e.key === "End") index = TABS.length - 1;
    else {
      const forward = (e.key === "ArrowRight") !== rtl;
      index = (index + (forward ? 1 : TABS.length - 1)) % TABS.length;
    }
    const next = TABS[index];
    selectTab(next);
    tabRefs.current[next]?.focus();
  }

  const tabRows = tab === "mine" ? customs : builtIns;
  // Sorted once on open, so toggling a row doesn't make it jump.
  const [hiddenFirst] = useState(() =>
    props.showHidden ? new Set(props.techniques.filter((x) => props.isHidden(x.id)).map((x) => x.id)) : null,
  );
  const rows = hiddenFirst
    ? [...tabRows.filter((x) => hiddenFirst.has(x.id)), ...tabRows.filter((x) => !hiddenFirst.has(x.id))]
    : tabRows;

  return (
    <ScrollPanel label={t("library.panel")}>
      <BrandHeader
        line={t("library.line")}
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost library-new"
              aria-label={t("picker.newTechnique")}
              onClick={props.onNew}
            >
              <span aria-hidden="true">+</span> {t("library.new")}
            </button>
            <button
              type="button"
              className="icon-btn"
              data-dialog-close
              aria-label={t("library.close")}
              onClick={props.onClose}
            >
              ✕
            </button>
          </>
        }
      />

      <div className="library-tabs" role="tablist" aria-label={t("library.panel")}>
        {TABS.map((id) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            type="button"
            role="tab"
            id={`library-tab-${id}`}
            className="library-tab"
            aria-selected={tab === id}
            aria-controls="library-tabpanel"
            tabIndex={tab === id ? 0 : -1}
            onClick={() => selectTab(id)}
            onKeyDown={onTabKey}
          >
            {id === "mine" ? t("library.tabMine") : t("library.tabBuiltIn")}
            <span className="library-tab-count">
              {id === "mine" ? customs.length : builtIns.length}
            </span>
          </button>
        ))}
      </div>

      <div id="library-tabpanel" role="tabpanel" aria-labelledby={`library-tab-${tab}`}>
        {tab === "mine" && customs.length === 0 ? (
          <div className="library-empty">
            <p className="empty-note">{t("library.emptyMine")}</p>
            <button type="button" className="btn btn-primary" onClick={props.onNew}>
              {t("picker.newTechnique")}
            </button>
            <button type="button" className="linkish" onClick={() => selectTab("builtin")}>
              {t("library.emptyHint")}
            </button>
          </div>
        ) : (
          <ul className="library-list">
            {rows.map((tech) => {
              const expanded = expandedId === tech.id;
              const guide = guideForTechnique(tech);
              const name = techniqueDisplayName(tech);
              const selected = tech.id === props.selectedId;
              const hidden = props.isHidden(tech.id);
              const block = hidden ? null : props.hideBlock(tech.id);
              const className = ["library-row", expanded && "is-open", hidden && "is-hidden"]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={tech.id} id={`tech-${tech.id}`} className={className}>
                  <div className="library-row-line">
                  <button
                    type="button"
                    className="library-row-head"
                    aria-expanded={expanded}
                    aria-controls={`tech-${tech.id}-more`}
                    onClick={() => setExpandedId(expanded ? null : tech.id)}
                  >
                    <span className="library-row-title">
                      <strong dir="auto">{name}</strong>
                      {selected && <span className="library-badge">{t("library.selected")}</span>}
                      {hidden && (
                        <span className="library-badge library-badge--muted">
                          {t("library.hidden")}
                        </span>
                      )}
                    </span>
                    <span className="library-row-meta">{formatTechniqueRhythm(tech)}</span>
                  </button>
                  <button
                    type="button"
                    className="library-eye"
                    aria-pressed={!hidden}
                    aria-disabled={block ? true : undefined}
                    aria-label={`${t("library.showOnTimer")}: ${name}`}
                    title={
                      block === "selected"
                        ? t("picker.keepSelected")
                        : block === "last"
                          ? t("picker.keepOne")
                          : t("library.showOnTimer")
                    }
                    onClick={() => {
                      if (block) return;
                      props.onSetHidden(tech, !hidden);
                    }}
                  >
                    <EyeIcon off={hidden} />
                  </button>
                  </div>
                  {expanded && (
                    <div className="library-row-more" id={`tech-${tech.id}-more`}>
                      <p className="guide-best">{guide.bestFor}</p>
                      <p className="guide-blurb">{guide.blurb}</p>
                      <div className="library-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={props.running || selected}
                          title={props.running ? t("library.runningHint") : undefined}
                          onClick={() => props.onUse(tech.id)}
                        >
                          {t("library.use")}
                        </button>
                        {tech.kind === "custom" ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              aria-label={`${t("library.edit")}: ${name}`}
                              onClick={() => props.onEdit(tech.id)}
                            >
                              {t("library.edit")}
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger library-delete"
                              aria-label={`${t("settings.delete")}: ${name}`}
                              onClick={() => {
                                // The row goes away; keep focus somewhere sensible.
                                tabRefs.current[tab]?.focus();
                                props.onDelete(tech);
                              }}
                            >
                              {t("settings.delete")}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            aria-label={`${t("library.customize")}: ${name}`}
                            onClick={() => props.onCustomize(tech.id)}
                          >
                            {t("library.customize")}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ScrollPanel>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {off && (
        <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}
