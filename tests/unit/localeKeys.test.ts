/**
 * CI guard: every leaf key in locales/en/{ui,techniques}.json must exist
 * in every other language listed in locales/manifest.json.
 *
 * Extra keys in other locales are allowed when they look like i18next plural
 * forms (`_one`, `_few`, …) for a base key that exists in en.
 */
import { assertEquals } from "jsr:@std/assert@1";

const LOCALES_ROOT = new URL("../../locales/", import.meta.url);
const CATALOGS = ["ui.json", "techniques.json"] as const;
const PLURAL_SUFFIXES = ["_zero", "_one", "_two", "_few", "_many", "_other"] as const;

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function leafPaths(value: Json, prefix = ""): string[] {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return prefix ? [prefix] : [];
    return entries.flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
  }
  return prefix ? [prefix] : [];
}

function isAllowedExtra(key: string, enKeys: Set<string>): boolean {
  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(suffix)) {
      const base = key.slice(0, -suffix.length);
      if (enKeys.has(base) || enKeys.has(`${base}_one`) || enKeys.has(`${base}_other`)) {
        return true;
      }
      // en often stores the singular as `timer.cycles` while others use `timer.cycles_few`
      const dot = base.lastIndexOf(".");
      if (dot >= 0) {
        const parent = base; // e.g. timer.cycles
        if (enKeys.has(parent) || [...enKeys].some((k) => k.startsWith(`${parent}_`))) {
          return true;
        }
      }
    }
  }
  return false;
}

async function readJson(rel: string): Promise<Json> {
  const text = await Deno.readTextFile(new URL(rel, LOCALES_ROOT));
  return JSON.parse(text) as Json;
}

Deno.test("locale catalogs: all en keys present in every language", async () => {
  const manifest = (await readJson("manifest.json")) as { languages: string[] };
  const languages = manifest.languages;
  assertEquals(languages.includes("en"), true, "manifest must include en");

  const others = languages.filter((l) => l !== "en");
  const missing: string[] = [];
  const unexpectedExtra: string[] = [];

  for (const catalog of CATALOGS) {
    const en = await readJson(`en/${catalog}`);
    const enKeys = new Set(leafPaths(en));

    for (const lang of others) {
      const doc = await readJson(`${lang}/${catalog}`);
      const keys = new Set(leafPaths(doc));

      for (const key of enKeys) {
        if (!keys.has(key)) missing.push(`${lang}/${catalog}: missing ${key}`);
      }
      for (const key of keys) {
        if (!enKeys.has(key) && !isAllowedExtra(key, enKeys)) {
          unexpectedExtra.push(`${lang}/${catalog}: unexpected extra ${key}`);
        }
      }
    }
  }

  if (missing.length || unexpectedExtra.length) {
    const lines = [
      ...missing.slice(0, 50),
      ...(missing.length > 50 ? [`…and ${missing.length - 50} more missing`] : []),
      ...unexpectedExtra.slice(0, 20),
      ...(unexpectedExtra.length > 20
        ? [`…and ${unexpectedExtra.length - 20} more unexpected extras`]
        : []),
    ];
    throw new Error(
      `Locale key mismatch (missing ${missing.length}, unexpected extra ${unexpectedExtra.length}):\n` +
        lines.join("\n"),
    );
  }
});
