import type { Technique } from "./types";
import catalog from "../../website/techniques.json";

export interface TechniqueGuideEntry {
  id: string;
  name: string;
  workBreak: string;
  bestFor: string;
  blurb: string;
}

const ENTRIES = catalog as TechniqueGuideEntry[];

/** Built-in technique guidance. Shared with the download site (`website/techniques.json`). */
export const TECHNIQUE_GUIDE: TechniqueGuideEntry[] = ENTRIES.filter((g) => g.id !== "custom");

export const CUSTOM_GUIDE: TechniqueGuideEntry =
  ENTRIES.find((g) => g.id === "custom") ?? {
    id: "custom",
    name: "Your own",
    workBreak: "User-defined ratios + long-break cadence",
    bestFor: "Power users",
    blurb: "Bake your own intervals in Settings.",
  };

export function guideForTechnique(t: Pick<Technique, "id" | "mode" | "kind" | "name">): TechniqueGuideEntry {
  const builtIn = TECHNIQUE_GUIDE.find((g) => g.id === t.id);
  if (builtIn) return builtIn;

  if (t.mode === "flowtime") {
    return {
      id: t.id,
      name: t.name,
      workBreak: "Count-up focus · proportional break",
      bestFor: "Flow-heavy creative work",
      blurb: "Your custom Flowtime rhythm — work until focus fades, then rest in proportion.",
    };
  }
  if (t.mode === "hybrid") {
    return {
      id: t.id,
      name: t.name,
      workBreak: "Fixed start → optional flow after the bell",
      bestFor: "Power users",
      blurb: "Your custom Hybrid rhythm — structured start with room to keep going.",
    };
  }
  return {
    id: t.id,
    name: t.name,
    workBreak: "User-defined focus, break, and long-break cadence",
    bestFor: "Power users",
    blurb: "Your custom interval set — dial ratios and long-break cadence to match the day.",
  };
}

export function techniqueTooltip(t: Pick<Technique, "id" | "mode" | "kind" | "name">): string {
  const g = guideForTechnique(t);
  return `${g.workBreak}\nBest for: ${g.bestFor}`;
}
