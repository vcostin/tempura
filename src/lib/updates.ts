/** Pure helpers for the GitHub Releases updater — no Tauri imports. */

export type UpdateUiStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; version: string }
  | { kind: "downloading"; version: string; percent: number | null }
  | { kind: "installing"; version: string }
  | { kind: "error"; source: "check" | "install"; soft: boolean; detail?: string };

export const UPDATE_ERROR_DETAIL_MAX = 220;

/** One calm line for About — trim, collapse space, cap length. */
export function formatUpdateErrorDetail(
  err: unknown,
  max = UPDATE_ERROR_DETAIL_MAX,
): string {
  const raw = err instanceof Error ? err.message : String(err);
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  if (max < 1 || trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export function downloadPercent(downloaded: number, total: number | null | undefined): number | null {
  if (total == null || total <= 0) return null;
  return Math.min(100, Math.round((downloaded / total) * 100));
}

/** Network / empty-release failures should stay quiet — not a scary dump. */
export function isSoftUpdateError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const needles = [
    "error sending request",
    "failed to fetch",
    "network",
    "timed out",
    "timeout",
    "connection",
    "could not connect",
    "dns",
    "offline",
    "unreachable",
    "404",
    "not found",
    "status code 404",
    "could not fetch a valid release json",
    "os error 101",
    "os error 111",
    "os error -2",
    "os error -3",
  ];
  return needles.some((n) => msg.includes(n));
}
