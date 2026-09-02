export type TextDir = "ltr" | "rtl";

export interface LocaleMeta {
  code: string;
  name: string;
  nativeName: string;
  dir: TextDir;
}

const metaModules = import.meta.glob("../../../locales/*/_meta.json", {
  eager: true,
  import: "default",
}) as Record<string, LocaleMeta>;

function codeFromPath(path: string): string {
  const match = path.match(/locales\/([^/]+)\/_meta\.json$/);
  return match?.[1] ?? "";
}

/** All shipped locales, English first, then native-name order. */
export const LOCALES: LocaleMeta[] = Object.entries(metaModules)
  .map(([path, meta]) => {
    const code = meta.code || codeFromPath(path);
    return {
      code,
      name: meta.name,
      nativeName: meta.nativeName,
      dir: (meta.dir === "rtl" ? "rtl" : "ltr") as TextDir,
    };
  })
  .sort((a, b) => {
    if (a.code === "en") return -1;
    if (b.code === "en") return 1;
    return a.nativeName.localeCompare(b.nativeName, "en");
  });

const BY_CODE = new Map(LOCALES.map((l) => [l.code, l]));

export function localeMeta(code: string): LocaleMeta | undefined {
  return BY_CODE.get(code);
}

export function isRtl(code: string): boolean {
  return localeMeta(code)?.dir === "rtl";
}

export function applyDocumentLocale(code: string): void {
  const meta = localeMeta(code);
  const lang = meta?.code ?? "en";
  const dir = meta?.dir ?? "ltr";
  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/[.@].*$/, "");
}

/** Map OS / browser tags like zh-CN or pt_BR onto a shipped catalog. Unknown → English. */
export function resolveLocale(tag = navigator.language): string {
  const raw = normalizeTag(tag || "");
  if (!raw) return "en";
  if (BY_CODE.has(raw)) return raw;

  const lower = raw.toLowerCase();
  const exact = LOCALES.find((l) => l.code.toLowerCase() === lower);
  if (exact) return exact.code;

  const base = raw.split(/[-_]/)[0]?.toLowerCase() ?? "";
  if (!base) return "en";
  if (base === "zh") return BY_CODE.has("zh-Hans") ? "zh-Hans" : "en";
  if (base === "pt") return BY_CODE.has("pt-BR") ? "pt-BR" : "en";

  const prefixed = LOCALES.find(
    (l) => l.code.toLowerCase() === base || l.code.toLowerCase().startsWith(`${base}-`),
  );
  return prefixed?.code ?? "en";
}
