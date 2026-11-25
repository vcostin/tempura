import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { isDesktopShell, isTauri } from "../lib/platform";
import {
  downloadPercent,
  formatUpdateErrorDetail,
  isSoftUpdateError,
  type UpdateUiStatus,
} from "../lib/updates";

interface Options {
  /** Settings have been loaded from the desktop shell. */
  ready: boolean;
  autoCheck: boolean;
  /** Packaged release builds may offer an overlay; `tauri:dev` stays silent. */
  allowAutoOffer: boolean;
  /**
   * The Windows portable exe. It checks its own entry in `latest.json`, and never
   * runs an installer: "Update & restart" swaps its exe only when `selfUpdate` is
   * on; otherwise the action opens the download page.
   */
  portable: boolean;
  selfUpdate: boolean;
}

/** The portable exe's entry in `latest.json` (see src-tauri/src/portable.rs). */
const PORTABLE_TARGET = "windows-x86_64-portable";

export function useUpdater(options: Options) {
  const { ready, autoCheck, allowAutoOffer, portable, selfUpdate } = options;
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
      const update = await checkUpdate({ timeout: 15_000, ...(portable ? { target: PORTABLE_TARGET } : {}) });
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
      const soft = isSoftUpdateError(err);
      const detail = soft ? undefined : formatUpdateErrorDetail(err) || undefined;
      setStatus({ kind: "error", source: "check", soft, detail });
    } finally {
      busyRef.current = false;
    }
  }, [available, portable]);

  const install = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || busyRef.current) return;
    if (portable && !selfUpdate) {
      await invoke("open_download_page").catch(() => {});
      return;
    }
    busyRef.current = true;
    const version = pending.version;
    if (portable) {
      setStatus({ kind: "downloading", version, percent: null });
      try {
        // Downloads, checks the signature, swaps the exe and restarts.
        await invoke("install_portable_update");
      } catch (err) {
        setStatus({
          kind: "error",
          source: "install",
          soft: isSoftUpdateError(err),
          detail: formatUpdateErrorDetail(err) || undefined,
        });
      } finally {
        busyRef.current = false;
      }
      return;
    }
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
      setStatus({
        kind: "error",
        source: "install",
        soft: isSoftUpdateError(err),
        detail: formatUpdateErrorDetail(err) || undefined,
      });
    } finally {
      busyRef.current = false;
    }
  }, [portable, selfUpdate]);

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
