/// <reference lib="deno.ns" />
/**
 * Build the GitHub Pages site: one prerendered page per locale, so every language has
 * its own crawlable URL (English at the root, others at /<code>/), with hreflang links
 * and a sitemap.
 *
 *   deno task website:build            # writes _site/
 *   deno task website:build out-dir    # writes elsewhere
 */
import { type Catalog, type LanguageSuggestion, type LocaleMeta, localeSlug, renderPage, renderSitemap } from "./website/page.ts";

const ROOT = new URL("../", import.meta.url);
const STATIC = new URL("website/", ROOT);
const LOCALES = new URL("locales/", ROOT);

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await Deno.readTextFile(url)) as T;
}

export async function loadCatalogs(): Promise<Catalog[]> {
  const manifest = await readJson<{ languages: string[] }>(new URL("manifest.json", LOCALES));
  return Promise.all(
    manifest.languages.map(async (code) => ({
      meta: await readJson<LocaleMeta>(new URL(`${code}/_meta.json`, LOCALES)),
      ui: await readJson<Catalog["ui"]>(new URL(`${code}/ui.json`, LOCALES)),
      techniques: await readJson<Catalog["techniques"]>(new URL(`${code}/techniques.json`, LOCALES)),
    })),
  );
}

export async function appVersion(): Promise<string> {
  return (await readJson<{ version: string }>(new URL("package.json", ROOT))).version;
}

/** Render every page in memory: path (relative to the site root) → HTML. */
export async function renderSite(): Promise<Map<string, string>> {
  const catalogs = await loadCatalogs();
  const en = catalogs.find((c) => c.meta.code === "en");
  if (!en) throw new Error("locales/en is required");
  const locales = catalogs.map((c) => c.meta);
  const version = await appVersion();
  const out = new Map<string, string>();
  const suggestions: Record<string, LanguageSuggestion> = {};
  for (const { meta, ui } of catalogs) {
    if (meta.code === "en") continue;
    const site = ui.site as Record<string, string>;
    suggestions[meta.code] = {
      href: `./${localeSlug(meta.code)}`,
      text: site.suggestLanguage,
      dismiss: site.suggestDismiss,
      dir: meta.dir,
    };
  }
  for (const catalog of catalogs) {
    const isRoot = catalog.meta.code === "en";
    const { html } = await renderPage({ catalog, en, locales, version, suggestions: isRoot ? suggestions : undefined });
    out.set(`${localeSlug(catalog.meta.code)}index.html`, html);
  }
  out.set("sitemap.xml", renderSitemap(locales));
  return out;
}

async function copyDir(from: URL, to: URL) {
  await Deno.mkdir(to, { recursive: true });
  for await (const entry of Deno.readDir(from)) {
    const src = new URL(entry.name + (entry.isDirectory ? "/" : ""), from);
    const dst = new URL(entry.name + (entry.isDirectory ? "/" : ""), to);
    if (entry.isDirectory) await copyDir(src, dst);
    else await Deno.copyFile(src, dst);
  }
}

if (import.meta.main) {
  const outArg = Deno.args[0] ?? "_site";
  const out = new URL(outArg.endsWith("/") ? outArg : `${outArg}/`, `file://${Deno.cwd()}/`);
  await Deno.remove(out, { recursive: true }).catch(() => {});
  await copyDir(STATIC, out);
  for (const [path, body] of await renderSite()) {
    const file = new URL(path, out);
    await Deno.mkdir(new URL("./", file), { recursive: true });
    await Deno.writeTextFile(file, body);
  }
  console.log(`Website built into ${decodeURIComponent(out.pathname)}`);
}
