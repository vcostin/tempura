import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { applyDocumentLocale, LOCALES, resolveLocale } from "./languages";

const uiModules = import.meta.glob("../../../locales/*/ui.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<string, unknown>>;

const techniqueModules = import.meta.glob("../../../locales/*/techniques.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<string, unknown>>;

function localeFromPath(path: string): string {
  const match = path.match(/locales\/([^/]+)\/(?:ui|techniques)\.json$/);
  return match?.[1] ?? "";
}

const resources: Record<string, { ui: Record<string, unknown>; techniques: Record<string, unknown> }> =
  {};

for (const [path, bundle] of Object.entries(uiModules)) {
  const code = localeFromPath(path);
  if (!code) continue;
  resources[code] ??= { ui: {}, techniques: {} };
  resources[code].ui = bundle;
}

for (const [path, bundle] of Object.entries(techniqueModules)) {
  const code = localeFromPath(path);
  if (!code) continue;
  resources[code] ??= { ui: {}, techniques: {} };
  resources[code].techniques = bundle;
}

const initialLng = resolveLocale();

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLng,
  fallbackLng: "en",
  supportedLngs: LOCALES.map((l) => l.code),
  nonExplicitSupportedLngs: false,
  ns: ["ui", "techniques"],
  defaultNS: "ui",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  returnNull: false,
  initAsync: false,
});

i18n.on("languageChanged", (lng) => {
  applyDocumentLocale(lng);
});

applyDocumentLocale(i18n.language);

export { i18n };
export {
  applyDocumentLocale,
  isRtl,
  LOCALES,
  localeMeta,
  resolveLocale,
} from "./languages";
export type { LocaleMeta, TextDir } from "./languages";
