/**
 * CI guard (fully dynamic):
 * - Catalogs = every `*.json` under `locales/en/` except `_meta.json`
 * - Languages = every `locales/<code>/` directory that looks like a locale
 *   (has `_meta.json`), cross-checked against `locales/manifest.json`
 * - Every en leaf key must exist in every other language’s matching catalog
 *
 * Adding a language: create `locales/<code>/`, fill catalogs, list it in
 * `manifest.json` — no test edits required. Missing keys or manifest drift fails CI.
 *
 * Extra keys in other locales are allowed when they look like i18next plural
 * forms (`_one`, `_few`, …) for a base key that exists in en.
 */
import { assertEquals } from "jsr:@std/assert@1";

const LOCALES_ROOT = new URL("../../locales/", import.meta.url);
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
    if (!key.endsWith(suffix)) continue;
    const base = key.slice(0, -suffix.length);
    if (enKeys.has(base) || enKeys.has(`${base}_one`) || enKeys.has(`${base}_other`)) {
      return true;
    }
    if (enKeys.has(base) || [...enKeys].some((k) => k.startsWith(`${base}_`))) {
      return true;
    }
  }
  return false;
}

async function readJson(rel: string): Promise<Json> {
  const text = await Deno.readTextFile(new URL(rel, LOCALES_ROOT));
  return JSON.parse(text) as Json;
}

async function listEnCatalogs(): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(new URL("en/", LOCALES_ROOT))) {
    if (!entry.isFile || !entry.name.endsWith(".json")) continue;
    if (entry.name === "_meta.json") continue;
    names.push(entry.name);
  }
  names.sort();
  return names;
}

async function listLocaleDirs(): Promise<string[]> {
  const codes: string[] = [];
  for await (const entry of Deno.readDir(LOCALES_ROOT)) {
    if (!entry.isDirectory) continue;
    try {
      await Deno.stat(new URL(`${entry.name}/_meta.json`, LOCALES_ROOT));
    } catch {
      continue;
    }
    codes.push(entry.name);
  }
  codes.sort();
  return codes;
}

Deno.test("locale catalogs: en keys present in every discovered language", async () => {
  const catalogs = await listEnCatalogs();
  assertEquals(catalogs.length > 0, true, "expected at least one en catalog json");

  const onDisk = await listLocaleDirs();
  assertEquals(onDisk.includes("en"), true, "locales/en must exist");

  const manifest = (await readJson("manifest.json")) as { languages: string[] };
  const inManifest = [...manifest.languages].sort();
  assertEquals(
    inManifest,
    onDisk,
    "locales/manifest.json languages must match locale directories (with _meta.json)",
  );

  const others = onDisk.filter((l) => l !== "en");
  const missing: string[] = [];
  const unexpectedExtra: string[] = [];
  const missingFiles: string[] = [];

  for (const catalog of catalogs) {
    const en = await readJson(`en/${catalog}`);
    const enKeys = new Set(leafPaths(en));

    for (const lang of others) {
      let doc: Json;
      try {
        doc = await readJson(`${lang}/${catalog}`);
      } catch {
        missingFiles.push(`${lang}/${catalog}`);
        continue;
      }
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

  if (missingFiles.length || missing.length || unexpectedExtra.length) {
    const lines = [
      ...missingFiles.map((f) => `missing file: ${f}`),
      ...missing.slice(0, 50),
      ...(missing.length > 50 ? [`…and ${missing.length - 50} more missing keys`] : []),
      ...unexpectedExtra.slice(0, 20),
      ...(unexpectedExtra.length > 20
        ? [`…and ${unexpectedExtra.length - 20} more unexpected extras`]
        : []),
    ];
    throw new Error(
      `Locale mismatch (missing files ${missingFiles.length}, missing keys ${missing.length}, unexpected extra ${unexpectedExtra.length}):\n` +
        lines.join("\n"),
    );
  }
});
