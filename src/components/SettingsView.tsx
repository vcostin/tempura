import { useState, type FormEvent } from "react";
import { api, formatTechniqueRhythm } from "../lib/api";
import { ensureNotificationPermission } from "../lib/platform";
import { guideForTechnique } from "../lib/techniqueGuide";
import type { AppInfo, AppSettings, Technique, TechniqueInput } from "../lib/types";
import { THEMES } from "../lib/types";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";

interface Props {
  settings: AppSettings;
  onPatch: (partial: Partial<AppSettings>) => Promise<void>;
  techniques: Technique[];
  onClose: () => void;
  desktop: boolean;
  autostart: boolean;
  autostartAvailable: boolean;
  onToggleAutostart: (enabled: boolean) => Promise<void>;
  info: AppInfo | null;
  onCreateTechnique: (input: TechniqueInput) => Promise<Technique>;
  onUpdateTechnique: (id: string, input: TechniqueInput) => Promise<Technique>;
  onDeleteTechnique: (id: string) => Promise<void>;
  onTechniquesChanged: () => Promise<void>;
  onOpenGuide?: () => void;
  onQuit?: () => void;
}

export function SettingsView(props: Props) {
  const { settings } = props;
  const [draft, setDraft] = useState({
    name: "",
    focusMins: 25,
    shortMins: 5,
    longMins: 15,
    cycles: 4,
    mode: "classic",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testNotifyBusy, setTestNotifyBusy] = useState(false);
  const [testNotifyMsg, setTestNotifyMsg] = useState<string | null>(null);

  async function sendTestNotification() {
    setTestNotifyBusy(true);
    setTestNotifyMsg(null);
    try {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        setTestNotifyMsg("Notification permission denied.");
        return;
      }
      await api.debugTestNotification();
      setTestNotifyMsg("Sent — check the system tray / notification center.");
    } catch (err) {
      setTestNotifyMsg(String(err));
    } finally {
      setTestNotifyBusy(false);
    }
  }

  async function saveCustom(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const input: TechniqueInput = {
      name: draft.name.trim() || "Custom",
      focusSecs: Math.round(draft.focusMins * 60),
      shortBreakSecs: Math.round(draft.shortMins * 60),
      longBreakSecs: Math.round(draft.longMins * 60),
      cyclesBeforeLong: draft.cycles,
      flowRatio: draft.mode === "flowtime" || draft.mode === "hybrid" ? settings.flowRatio : null,
      mode: draft.mode,
      accent: "#6B8F71",
    };
    try {
      if (editingId) {
        await props.onUpdateTechnique(editingId, input);
      } else {
        await props.onCreateTechnique(input);
      }
      setDraft({
        name: "",
        focusMins: 25,
        shortMins: 5,
        longMins: 15,
        cycles: 4,
        mode: "classic",
      });
      setEditingId(null);
      await props.onTechniquesChanged();
    } catch (err) {
      setError(String(err));
    }
  }

  function startEdit(t: Technique) {
    if (t.kind === "system") return;
    setEditingId(t.id);
    setDraft({
      name: t.name,
      focusMins: Math.round(t.focusSecs / 60),
      shortMins: Math.round(t.shortBreakSecs / 60),
      longMins: Math.round(t.longBreakSecs / 60),
      cycles: t.cyclesBeforeLong,
      mode: t.mode,
    });
  }

  return (
    <ScrollPanel label="Settings">
      <BrandHeader
        line="Settings · you can change more."
        actions={
          <button type="button" className="icon-btn" aria-label="Close settings" onClick={props.onClose}>
            ✕
          </button>
        }
      />

      <section className="section">
        <h3>Theme</h3>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="theme-swatch"
              data-theme-preview={t.id}
              aria-pressed={settings.theme === t.id}
              onClick={() => void props.onPatch({ theme: t.id })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <h3>Session defaults</h3>
        <div className="field">
          <label htmlFor="default-tech">Default technique</label>
          <select
            id="default-tech"
            value={settings.defaultTechniqueId}
            onChange={(e) => void props.onPatch({ defaultTechniqueId: e.target.value })}
          >
            {props.techniques.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {formatTechniqueRhythm(t, settings.flowRatio)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="long-n">Long break every N cycles</label>
          <input
            id="long-n"
            type="number"
            min={1}
            max={12}
            value={settings.longBreakEveryN}
            onChange={(e) =>
              void props.onPatch({ longBreakEveryN: Number(e.target.value) || 4 })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="flow-ratio">Flowtime break ratio</label>
          <input
            id="flow-ratio"
            type="range"
            min={11}
            max={33}
            value={Math.round(settings.flowRatio * 100)}
            onChange={(e) =>
              void props.onPatch({ flowRatio: Number(e.target.value) / 100 })
            }
          />
          <span className="hint">
            Break ≈ work × {(settings.flowRatio).toFixed(2)} (about 1:
            {Math.round(1 / settings.flowRatio)})
          </span>
        </div>
      </section>

      <section className="section">
        <h3>Notifications</h3>
        <div className="toggle-row">
          <span>Phase notifications</span>
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={settings.notificationsEnabled}
            onClick={() =>
              void props.onPatch({ notificationsEnabled: !settings.notificationsEnabled })
            }
          />
        </div>
        <div className="toggle-row">
          <span>Gentle sound</span>
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={settings.soundEnabled}
            onClick={() => void props.onPatch({ soundEnabled: !settings.soundEnabled })}
          />
        </div>
        <div className="toggle-row">
          <span>Halfway tick</span>
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={settings.halfwayTick}
            onClick={() => void props.onPatch({ halfwayTick: !settings.halfwayTick })}
          />
        </div>
        {props.info?.debug && (
          <>
            <p className="hint">
              Dev only: on recent macOS, notifications use AppleScript so banners
              appear (Script Editor icon). Custom Tempura icons need an installed
              .app. Linux uses the Tempura icon; Windows unpackaged builds may
              show a PowerShell icon.
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: "0.75rem" }}
              disabled={testNotifyBusy}
              onClick={() => void sendTestNotification()}
            >
              {testNotifyBusy ? "Sending…" : "Send test notification"}
            </button>
            {testNotifyMsg && (
              <p className="hint" style={{ marginTop: "0.5rem" }}>
                {testNotifyMsg}
              </p>
            )}
          </>
        )}
      </section>

      {props.desktop && (
        <section className="section">
          <h3>Desktop</h3>
          {props.autostartAvailable && (
            <div className="toggle-row">
              <span>Launch at login</span>
              <button
                type="button"
                className="toggle"
                role="switch"
                aria-checked={props.autostart}
                onClick={() => void props.onToggleAutostart(!props.autostart)}
              />
            </div>
          )}
          <div className="toggle-row">
            <span>Start minimized to tray</span>
            <button
              type="button"
              className="toggle"
              role="switch"
              aria-checked={settings.startMinimized}
              onClick={() => void props.onPatch({ startMinimized: !settings.startMinimized })}
            />
          </div>
          {props.onQuit && (
            <button type="button" className="btn btn-ghost" style={{ marginTop: "0.75rem" }} onClick={props.onQuit}>
              Quit Tempura
            </button>
          )}
        </section>
      )}

      <section className="section">
        <h3>Custom techniques</h3>
        <div className="tech-list">
          {props.techniques.map((t) => (
            <div key={t.id} className="tech-row">
              <div>
                <strong>{t.name}</strong>
                <div className="meta">
                  {t.kind === "system" ? "Built-in" : "Custom"}
                  {" · "}
                  {formatTechniqueRhythm(t, settings.flowRatio)}
                  {" · Best for: "}
                  {guideForTechnique(t).bestFor}
                </div>
              </div>
              {t.kind === "custom" && (
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => startEdit(t)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() =>
                      void props.onDeleteTechnique(t.id).then(() => props.onTechniquesChanged())
                    }
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={saveCustom} style={{ marginTop: "1rem" }}>
          <div className="field">
            <label htmlFor="c-name">{editingId ? "Edit technique" : "New technique"}</label>
            <input
              id="c-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Name"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="c-mode">Mode</label>
            <select
              id="c-mode"
              value={draft.mode}
              onChange={(e) => setDraft({ ...draft, mode: e.target.value })}
            >
              <option value="classic">Classic intervals</option>
              <option value="flowtime">Flowtime</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          {draft.mode !== "flowtime" && (
            <>
              <div className="field">
                <label htmlFor="c-focus">Focus (minutes)</label>
                <input
                  id="c-focus"
                  type="number"
                  min={1}
                  value={draft.focusMins}
                  onChange={(e) => setDraft({ ...draft, focusMins: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="c-short">Short break</label>
                <input
                  id="c-short"
                  type="number"
                  min={1}
                  value={draft.shortMins}
                  onChange={(e) => setDraft({ ...draft, shortMins: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="c-long">Long break</label>
                <input
                  id="c-long"
                  type="number"
                  min={1}
                  value={draft.longMins}
                  onChange={(e) => setDraft({ ...draft, longMins: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="c-cycles">Cycles before long</label>
                <input
                  id="c-cycles"
                  type="number"
                  min={1}
                  value={draft.cycles}
                  onChange={(e) => setDraft({ ...draft, cycles: Number(e.target.value) })}
                />
              </div>
            </>
          )}
          {error && <p className="hint" style={{ color: "var(--danger)" }}>{error}</p>}
          <button type="submit" className="btn btn-primary">
            {editingId ? "Save changes" : "Add technique"}
          </button>
          {editingId && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginLeft: "0.5rem" }}
              onClick={() => setEditingId(null)}
            >
              Cancel
            </button>
          )}
        </form>
      </section>

      <section className="section">
        <h3>About</h3>
        <div className="privacy-note">
          <p style={{ margin: "0 0 0.5rem" }}>
            <strong>{props.info?.name ?? "Tempura"}</strong>
            {props.info ? ` · v${props.info.version}` : ""}
          </p>
          <p style={{ margin: 0 }}>
            {props.info?.privacy ??
              "Your data stays on this machine. No accounts, no cloud, no sync."}
          </p>
          <p style={{ margin: "0.75rem 0 0" }}>
            Local SQLite under your app data folder is the source of truth. Closing the
            window hides to the tray — quit from here or the tray menu.
          </p>
          {props.onOpenGuide && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: "0.85rem" }}
              onClick={props.onOpenGuide}
            >
              Techniques guide
            </button>
          )}
        </div>
      </section>
    </ScrollPanel>
  );
}
