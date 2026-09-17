import { useCallback, useEffect, useRef, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { isDesktopShell, isTauri } from "../lib/platform";
import {
  downloadPercent,
  isSoftUpdateError,
  type UpdateUiStatus,
} from "../lib/updates";

interface Options {
  /** Settings have been loaded from the desktop shell. */
  ready: boolean;
  autoCheck: boolean;
  /** Packaged release builds may offer an overlay; `tauri:dev` stays silent. */
  allowAutoOffer: boolean;
}

export function useUpdater(options: Options) {
  const { ready, autoCheck, allowAutoOffer } = options;
  const available = isTauri() && isDesktopShell();
  const [status, setStatus] = useState<UpdateUiStatus>({ kind: "idle" });
  const [skipped, setSkipped] = useState(false);
  const [offerVersion, setOfferVersion] = useState("");
  const pendingRef = useRef<Update | null>(null);
  const autoCheckedRef = useRef(false);
  const busyRef = useRef(false);

  const check = useCallback(async (origin: "auto" | "manual") => {
    if (!available || busyRef.current) return;
    busyRef.current = true;
    pendingRef.current = null;
    if (origin === "manual") setSkipped(false);
    setStatus({ kind: "checking" });
    try {
      const { check: checkUpdate } = await import("@tauri-apps/plugin-updater");
      const update = await checkUpdate({ timeout: 15_000 });
      if (!update) {
        pendingRef.current = null;
        setStatus({ kind: "upToDate" });
        return;
      }
      pendingRef.current = update;
      setOfferVersion(update.version);
      setStatus({ kind: "available", version: update.version });
    } catch (err) {
      pendingRef.current = null;
      if (origin === "auto") {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({ kind: "error", source: "check", soft: isSoftUpdateError(err) });
    } finally {
      busyRef.current = false;
    }
  }, [available]);

  const install = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || busyRef.current) return;
    busyRef.current = true;
    const version = pending.version;
    let downloaded = 0;
    let total: number | null = null;
    setStatus({ kind: "downloading", version, percent: null });
    try {
      await pending.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
          downloaded = 0;
          setStatus({
            kind: "downloading",
            version,
            percent: downloadPercent(0, total),
          });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setStatus({
            kind: "downloading",
            version,
            percent: downloadPercent(downloaded, total),
          });
        } else if (event.event === "Finished") {
          setStatus({ kind: "installing", version });
        }
      });
      setStatus({ kind: "installing", version });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      setStatus({ kind: "error", source: "install", soft: isSoftUpdateError(err) });
    } finally {
      busyRef.current = false;
    }
  }, []);

  const skip = useCallback(() => {
    setSkipped(true);
  }, []);

  useEffect(() => {
    if (!available || !ready || !autoCheck || !allowAutoOffer) return;
    if (autoCheckedRef.current) return;
    autoCheckedRef.current = true;
    void check("auto");
  }, [available, ready, autoCheck, allowAutoOffer, check]);

  return {
    available,
    status,
    skipped,
    offerVersion,
    check: () => void check("manual"),
    install: () => void install(),
    skip,
    hasOffer: status.kind === "available" && !skipped,
  };
}

export type UpdaterApi = ReturnType<typeof useUpdater>;
