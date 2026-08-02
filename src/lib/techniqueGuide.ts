import type { Technique } from "./types";

export interface TechniqueGuideEntry {
  id: string;
  name: string;
  workBreak: string;
  bestFor: string;
  blurb: string;
}

/** Built-in technique guidance. */
export const TECHNIQUE_GUIDE: TechniqueGuideEntry[] = [
  {
    id: "classic",
    name: "Classic",
    workBreak: "25m focus / 5m break · long break after 4 cycles",
    bestFor: "Starting tasks, shallow work",
    blurb:
      "A gentle on-ramp. Short focus blocks keep momentum without intimidation — ideal when you’re spinning up or clearing lighter work.",
  },
  {
    id: "sprint",
    name: "Sprint",
    workBreak: "15m focus / 3m break",
    bestFor: "Warm-up, ADHD-friendly starts",
    blurb:
      "Tiny intervals to get moving. Use it to break inertia, dabble into a hard task, or rebuild attention after a distraction.",
  },
  {
    id: "deep",
    name: "Deep",
    workBreak: "50m focus / 10m break",
    bestFor: "Sustained concentration",
    blurb:
      "Longer focus with a real recovery. Good when you already know what you’re doing and need uninterrupted stretch time.",
  },
  {
    id: "fifty-two-seventeen",
    name: "52/17",
    workBreak: "52m focus / 17m break",
    bestFor: "Coding, writing, analysis",
    blurb:
      "Desk-work rhythm with a generous break. Enough runway for hard problems, then time to stand, stretch, and reset.",
  },
  {
    id: "ultradian",
    name: "Ultradian",
    workBreak: "90m focus / 20m break",
    bestFor: "Deep creative work",
    blurb:
      "Aligned with natural ultradian cycles. One long immersion, then a proper rest — best for creative deep dives.",
  },
  {
    id: "flowtime",
    name: "Flowtime",
    workBreak: "Count-up until you stop · break ≈ 1/5 of work time",
    bestFor: "Flow-heavy creative work",
    blurb:
      "No fixed focus length. Ride the wave while it lasts; Tempura suggests a break proportional to how long you worked.",
  },
  {
    id: "hybrid",
    name: "Hybrid",
    workBreak: "Classic start → optional Flowtime after the first bell",
    bestFor: "Most power users",
    blurb:
      "Begin with a fixed focus. When the bell rings, take a break — or keep flowing and let the session turn into Flowtime.",
  },
];

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
