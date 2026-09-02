import type { Technique } from "./types";
import { i18n } from "./i18n";

export interface TechniqueGuideEntry {
  id: string;
  name: string;
  workBreak: string;
  bestFor: string;
  blurb: string;
}

export const SYSTEM_TECHNIQUE_IDS = [
  "classic",
  "sprint",
  "deep",
  "fifty-two-seventeen",
  "ultradian",
  "flowtime",
  "hybrid",
] as const;

function readTechnique(id: string): TechniqueGuideEntry | null {
  if (!i18n.exists(`${id}.name`, { ns: "techniques" })) return null;
  return {
    id,
    name: i18n.t(`${id}.name`, { ns: "techniques" }),
    workBreak: i18n.t(`${id}.workBreak`, { ns: "techniques" }),
    bestFor: i18n.t(`${id}.bestFor`, { ns: "techniques" }),
    blurb: i18n.t(`${id}.blurb`, { ns: "techniques" }),
  };
}

/** Built-in technique guidance. Shared with the download site locale catalogs. */
export function techniqueGuideEntries(): TechniqueGuideEntry[] {
  return SYSTEM_TECHNIQUE_IDS.map((id) => readTechnique(id)).filter(
    (g): g is TechniqueGuideEntry => g !== null,
  );
}

export function customGuide(): TechniqueGuideEntry {
  return (
    readTechnique("custom") ?? {
      id: "custom",
      name: i18n.t("settings.defaultCustomName"),
      workBreak: i18n.t("guide.customIntervalWorkBreak"),
      bestFor: i18n.t("guide.customIntervalBestFor"),
      blurb: i18n.t("guide.customIntervalBlurb"),
    }
  );
}

export function techniqueDisplayName(
  t: Pick<Technique, "id" | "kind" | "name">,
): string {
  if (t.kind === "system") {
    const entry = readTechnique(t.id);
    if (entry) return entry.name;
  }
  return t.name;
}

export function guideForTechnique(
  t: Pick<Technique, "id" | "mode" | "kind" | "name">,
): TechniqueGuideEntry {
  const builtIn = readTechnique(t.id);
  if (builtIn) return builtIn;

  if (t.mode === "flowtime") {
    return {
      id: t.id,
      name: t.name,
      workBreak: i18n.t("guide.customFlowtimeWorkBreak"),
      bestFor: i18n.t("guide.customFlowtimeBestFor"),
      blurb: i18n.t("guide.customFlowtimeBlurb"),
    };
  }
  if (t.mode === "hybrid") {
    return {
      id: t.id,
      name: t.name,
      workBreak: i18n.t("guide.customHybridWorkBreak"),
      bestFor: i18n.t("guide.customHybridBestFor"),
      blurb: i18n.t("guide.customHybridBlurb"),
    };
  }
  return {
    id: t.id,
    name: t.name,
    workBreak: i18n.t("guide.customIntervalWorkBreak"),
    bestFor: i18n.t("guide.customIntervalBestFor"),
    blurb: i18n.t("guide.customIntervalBlurb"),
  };
}

export function techniqueTooltip(
  t: Pick<Technique, "id" | "mode" | "kind" | "name">,
): string {
  const g = guideForTechnique(t);
  return `${g.workBreak}\n${i18n.t("guide.tooltipBestFor", { value: g.bestFor })}`;
}
