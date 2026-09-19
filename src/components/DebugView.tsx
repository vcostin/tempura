import { useState } from "react";
import { api } from "../lib/api";
import { disableDebugAccess } from "../lib/debugAccess";
import { ensureNotificationPermission, isDesktopShell, isTauri } from "../lib/platform";
import type { AppInfo } from "../lib/types";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";

interface Props {
  info: AppInfo | null;
  onClose: () => void;
  /** Called after turning off unlocked debug access in a release build. */
  onAccessChanged?: () => void;
}

export function DebugView(props: Props) {
  const [testNotifyBusy, setTestNotifyBusy] = useState(false);
  const [testNotifyMsg, setTestNotifyMsg] = useState<string | null>(null);

  async function sendTestNotification() {
    setTestNotifyBusy(true);
    setTestNotifyMsg(null);
    try {
      if (!isTauri()) {
        setTestNotifyMsg("Notifications require the desktop shell.");
        return;
      }
      const granted = await ensureNotificationPermission();
      if (!granted) {
        setTestNotifyMsg("Notification permission denied.");
        return;
      }
      await api.debugTestNotification();
      setTestNotifyMsg("Sent — check Notification Center / system tray.");
    } catch (err) {
      setTestNotifyMsg(String(err));
    } finally {
      setTestNotifyBusy(false);
    }
  }

  function hideDebugEntry() {
    disableDebugAccess();
    props.onAccessChanged?.();
    props.onClose();
  }

  const buildKind = props.info?.debug
    ? "debug"
    : import.meta.env.DEV
      ? "vite-dev"
      : "release";

  const canTestNotify = Boolean(props.info?.debug);

  return (
    <ScrollPanel label="Debug">
      <BrandHeader
        line="Debug · tools for verifying the shell."
        actions={
          <button
            type="button"
            className="icon-btn"
            data-dialog-close
            aria-label="Close debug"
            onClick={props.onClose}
          >
            ✕
          </button>
        }
      />

      <section className="section">
        <h2>Build</h2>
        <p className="hint" style={{ margin: 0 }}>
          {props.info?.name ?? "Tempura"}
          {props.info ? ` · v${props.info.version}` : ""}
          {" · "}
          {buildKind}
          {isDesktopShell() ? " · desktop" : " · web"}
          {props.info?.notificationBackend
            ? ` · notify: ${props.info.notificationBackend}`
            : ""}
        </p>
      </section>

      <section className="section">
        <h2>Notifications</h2>
        <p className="hint">
          Delivery only — we do not customize the banner icon. On macOS without
          Apple Developer ID signing, the OS often attributes alerts to Script
          Editor; that limitation cannot be fixed in-app. Linux/Windows use the
          normal system notifier.
        </p>
        {canTestNotify ? (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: "0.75rem" }}
            disabled={testNotifyBusy}
            onClick={() => void sendTestNotification()}
          >
            {testNotifyBusy ? "Sending…" : "Send test notification"}
          </button>
        ) : (
          <p className="hint" style={{ marginTop: "0.75rem" }}>
            Test send is compiled out of release builds.
          </p>
        )}
        {testNotifyMsg && (
          <p className="hint" style={{ marginTop: "0.5rem" }}>
            {testNotifyMsg}
          </p>
        )}
      </section>

      <section className="section">
        <h2>Access</h2>
        <p className="hint">
          Hide the beetle on the timer. Click the version number in About five
          times to show it again.
        </p>
        <button type="button" className="btn btn-ghost" onClick={hideDebugEntry}>
          Hide debug entry
        </button>
      </section>
    </ScrollPanel>
  );
}
