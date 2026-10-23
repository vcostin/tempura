import { useTranslation } from "react-i18next";
import type { ToastMessage } from "../components/Toast";
import { techniqueDisplayName } from "../lib/techniqueGuide";
import type { Technique } from "../lib/types";
import { useSessionContext, useSettingsContext } from "./AppState";

/** Why a technique can't be hidden right now, or null when it can. */
export type HideBlock = "selected" | "last" | null;

/**
 * Which techniques show on the timer, and hiding or showing them with an Undo note.
 * Everything shows by default; the selected technique and the last visible one stay.
 */
export function useTechniqueVisibility(showToast: (toast: Omit<ToastMessage, "id">) => void) {
  const { t } = useTranslation();
  const session = useSessionContext();
  const settingsApi = useSettingsContext();
  const hiddenIds = settingsApi.settings.hiddenTechniqueIds;
  const isHidden = (id: string) => hiddenIds.includes(id) && id !== session.selectedId;
  const visible = session.techniques.filter((tech) => !isHidden(tech.id));
  const hidden = session.techniques.filter((tech) => isHidden(tech.id));

  function hideBlock(id: string): HideBlock {
    if (id === session.selectedId || id === settingsApi.settings.defaultTechniqueId) {
      return "selected";
    }
    if (visible.length <= 1) return "last";
    return null;
  }

  function setHidden(tech: Technique, hide: boolean, notify = true) {
    if (hide && hideBlock(tech.id)) return;
    void settingsApi.setTechniqueHidden(tech.id, hide);
    if (!hide || !notify) return;
    showToast({
      message: t("toast.hidden", { name: techniqueDisplayName(tech) }),
      actionLabel: t("toast.undo"),
      onAction: () => void settingsApi.setTechniqueHidden(tech.id, false),
    });
  }

  return { visible, hidden, isHidden, hideBlock, setHidden };
}
