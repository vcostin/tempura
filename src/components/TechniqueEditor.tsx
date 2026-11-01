import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatTechniqueRhythm } from "../lib/api";
import { techniqueDisplayName } from "../lib/techniqueGuide";
import type { Technique, TechniqueInput, TechniqueMode } from "../lib/types";
import { DEFAULT_FLOW_RATIO } from "../lib/types";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";
import { Select } from "./Select";
import { CloseIcon } from "./CloseIcon";

interface Props {
  /** The custom technique being edited; absent when creating. */
  editing?: Technique;
  /** A technique to start from when creating (e.g. a built-in to customize). */
  source?: Technique;
  onSave: (input: TechniqueInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

type Draft = {
  name: string;
  focusMins: number;
  shortMins: number;
  longMins: number;
  cycles: number;
  mode: TechniqueMode;
  flowPct: number;
};

function draftFrom(tech: Technique | undefined, name: string): Draft {
  if (!tech) {
    return {
      name,
      focusMins: 25,
      shortMins: 5,
      longMins: 15,
      cycles: 4,
      mode: "classic",
      flowPct: Math.round(DEFAULT_FLOW_RATIO * 100),
    };
  }
  return {
    name,
    focusMins: Math.round(tech.focusSecs / 60),
    shortMins: Math.round(tech.shortBreakSecs / 60),
    longMins: Math.round(tech.longBreakSecs / 60),
    cycles: tech.cyclesBeforeLong,
    mode: tech.mode,
    flowPct: Math.round((tech.flowRatio ?? DEFAULT_FLOW_RATIO) * 100),
  };
}

/** Create or edit one custom technique, with a live rhythm preview. */
export function TechniqueEditor({ editing, source, onSave, onDelete, onClose }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(() => {
    if (editing) return draftFrom(editing, editing.name);
    if (source) {
      return draftFrom(source, t("editor.copyName", { name: techniqueDisplayName(source) }));
    }
    return draftFrom(undefined, "");
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const usesFlow = draft.mode === "flowtime" || draft.mode === "hybrid";
  const input: TechniqueInput = {
    name: draft.name.trim() || t("settings.defaultCustomName"),
    focusSecs: Math.round(draft.focusMins * 60),
    shortBreakSecs: Math.round(draft.shortMins * 60),
    longBreakSecs: Math.round(draft.longMins * 60),
    cyclesBeforeLong: draft.cycles,
    flowRatio: usesFlow ? draft.flowPct / 100 : null,
    mode: draft.mode,
    accent: editing?.accent ?? "#6B8F71",
  };
  const preview = formatTechniqueRhythm({ ...input, flowRatio: input.flowRatio ?? null, mode: draft.mode });

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSave(input);
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    setError(null);
    setBusy(true);
    try {
      await onDelete();
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  }

  return (
    <ScrollPanel label={t("editor.panel")}>
      <BrandHeader
        line={editing ? t("settings.editTechnique") : t("settings.newTechnique")}
        actions={
          <button
            type="button"
            className="icon-btn"
            data-dialog-close
            aria-label={t("editor.back")}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        }
      />

      <form className="section recipe-form technique-editor" onSubmit={save}>
        <p className="editor-preview" aria-live="polite">
          <span className="editor-preview-label">{t("editor.preview")}</span>
          <span dir="auto">{preview}</span>
        </p>

        <div className="field">
          <label htmlFor="c-name">{t("settings.namePlaceholder")}</label>
          <input
            id="c-name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t("settings.namePlaceholder")}
            required
            autoComplete="off"
            dir="auto"
          />
        </div>
        <div className="field">
          <label htmlFor="c-mode">{t("settings.mode")}</label>
          <Select
            id="c-mode"
            value={draft.mode}
            onChange={(mode) => setDraft({ ...draft, mode })}
            options={[
              { value: "classic", label: t("settings.modeClassic") },
              { value: "flowtime", label: t("settings.modeFlowtime") },
              { value: "hybrid", label: t("settings.modeHybrid") },
            ]}
          />
        </div>
        {draft.mode !== "flowtime" && (
          <div className="field-grid">
            <div className="field">
              <label htmlFor="c-focus">{t("settings.focusMinutes")}</label>
              <input
                id="c-focus"
                type="number"
                min={1}
                value={draft.focusMins}
                onChange={(e) => setDraft({ ...draft, focusMins: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="c-short">{t("settings.shortBreak")}</label>
              <input
                id="c-short"
                type="number"
                min={1}
                value={draft.shortMins}
                onChange={(e) => setDraft({ ...draft, shortMins: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="c-long">{t("settings.longBreak")}</label>
              <input
                id="c-long"
                type="number"
                min={1}
                value={draft.longMins}
                onChange={(e) => setDraft({ ...draft, longMins: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="c-cycles">{t("settings.cyclesBeforeLong")}</label>
              <input
                id="c-cycles"
                type="number"
                min={1}
                value={draft.cycles}
                onChange={(e) => setDraft({ ...draft, cycles: Number(e.target.value) })}
              />
            </div>
          </div>
        )}
        {usesFlow && (
          <div className="field">
            <label htmlFor="c-flow">{t("settings.flowRatio")}</label>
            <input
              id="c-flow"
              type="range"
              min={11}
              max={33}
              value={draft.flowPct}
              onChange={(e) => setDraft({ ...draft, flowPct: Number(e.target.value) })}
            />
            <span className="hint">
              {t("settings.flowHint", {
                ratio: (draft.flowPct / 100).toFixed(2),
                inverse: Math.round(100 / draft.flowPct),
              })}
            </span>
          </div>
        )}
        {error && (
          <p className="hint" role="alert" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {editing ? t("settings.saveChanges") : t("settings.addTechnique")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t("settings.cancel")}
          </button>
          {editing && onDelete && (
            <button
              type="button"
              className="btn btn-danger editor-delete"
              disabled={busy}
              onClick={() => void remove()}
            >
              {t("settings.delete")}
            </button>
          )}
        </div>
      </form>
    </ScrollPanel>
  );
}
