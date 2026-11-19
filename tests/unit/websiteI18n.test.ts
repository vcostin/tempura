/// <reference lib="deno.ns" />
/**
 * The download site is prerendered per locale (scripts/build-website.ts). Locale strings
 * must land as text, never markup (security.md L5), and every language needs its own
 * crawlable URL with matching hreflang, canonical and CSP.
 */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { loadCatalogs, renderSite } from "../../scripts/build-website.ts";
import { esc, localeSlug, localeUrl, ORIGIN, renderPage, sha256Base64 } from "../../scripts/website/page.ts";

const catalogs = await loadCatalogs();
const site = await renderSite();
const en = catalogs.find((c) => c.meta.code === "en")!;

Deno.test("one page per manifest locale, English at the root", async () => {
  const manifest = JSON.parse(await Deno.readTextFile(new URL("../../locales/manifest.json", import.meta.url)));
  for (const code of manifest.languages as string[]) {
    assert(site.has(`${localeSlug(code)}index.html`), `missing page for ${code}`);
  }
  assertEquals(localeSlug("en"), "");
  assertEquals(localeSlug("pt-BR"), "pt-br/");
  assert(site.has("sitemap.xml"));
});

Deno.test("each page has lang/dir, self canonical, hreflang to all, share metas", () => {
  for (const { meta } of catalogs) {
    const html = site.get(`${localeSlug(meta.code)}index.html`)!;
    assertStringIncludes(html, `<html lang="${meta.code}" dir="${meta.dir}">`);
    assertStringIncludes(html, `rel="canonical" href="${localeUrl(meta.code)}"`);
    assertStringIncludes(html, `property="og:url" content="${localeUrl(meta.code)}"`);
    assertStringIncludes(html, `hreflang="x-default" href="${ORIGIN}"`);
    for (const other of catalogs) {
      assertStringIncludes(html, `hreflang="${other.meta.code}" href="${localeUrl(other.meta.code)}"`);
    }
    for (const needle of [
      `name="twitter:card" content="summary_large_image"`,
      `name="twitter:image" content="${ORIGIN}shots/timer.png"`,
      `"@type":"SoftwareApplication"`,
      `"@type":"FAQPage"`,
      "releases/latest",
    ]) {
      assertStringIncludes(html, needle, `${meta.code} is missing ${needle}`);
    }
    // Every {{placeholder}} got a value.
    assert(!/\{\{\s*\w+\s*\}\}/.test(html.replace(/<script type="application\/json"[\s\S]*?<\/script>/, "")), `${meta.code} has an unfilled placeholder`);
  }
});

Deno.test("CSP sha256 matches each page's JSON-LD body", async () => {
  for (const [path, html] of site) {
    if (!path.endsWith(".html")) continue;
    const body = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    assert(body, `${path} has no JSON-LD`);
    assertStringIncludes(html, `'sha256-${await sha256Base64(body)}'`, `${path} CSP hash is stale`);
  }
});

Deno.test("only the root page auto-redirects by language", () => {
  for (const [path, html] of site) {
    if (!path.endsWith(".html")) continue;
    assertEquals(html.includes("redirect.js"), path === "index.html", path);
  }
});

Deno.test("only the root page offers other languages, one per non-English locale", () => {
  for (const [path, html] of site) {
    if (!path.endsWith(".html")) continue;
    assertEquals(html.includes('id="lang-suggest"'), path === "index.html", path);
  }
  const data = JSON.parse(site.get("index.html")!.match(/id="site-data">([\s\S]*?)<\/script>/)![1]);
  assertEquals(Object.keys(data.suggestions).sort(), catalogs.map((c) => c.meta.code).filter((c) => c !== "en").sort());
  assertEquals(data.suggestions["pt-BR"].href, "./pt-br/");
});

Deno.test("links to English carry ?lang=en; hreflang and canonical stay clean", () => {
  const de = site.get("de/index.html")!;
  assertStringIncludes(de, 'value="../?lang=en"');
  assertStringIncludes(de, 'href="../?lang=en" hreflang="en"');
  assert(!/rel="(?:canonical|alternate)"[^>]*\?lang=/.test(site.get("index.html")! + de), "SEO links must not carry ?lang");
  assert(!site.get("sitemap.xml")!.includes("?lang"));
  assertStringIncludes(site.get("index.html")!, 'id="lang-suggest" role="region" aria-live="polite"');
});

Deno.test("nav targets exist: techniques, features (the cards), faq, download", () => {
  const html = site.get("index.html")!;
  for (const id of ["techniques", "features", "faq", "download"]) {
    assertStringIncludes(html, `href="#${id}"`);
    assertStringIncludes(html, `id="${id}"`);
  }
  assertStringIncludes(html, 'class="features" id="features"');
});

Deno.test("a _meta.json dir other than ltr/rtl fails the build", async () => {
  const bad = structuredClone(en);
  bad.meta.dir = 'rtl" onclick="alert(1)' as never;
  let threw = false;
  try {
    await renderPage({ catalog: bad, en, locales: [bad.meta], version: "1.0.0" });
  } catch {
    threw = true;
  }
  assert(threw, "renderPage accepted an invalid dir");
});

Deno.test("redirect.js knows exactly the manifest locales", async () => {
  const js = await Deno.readTextFile(new URL("../../website/redirect.js", import.meta.url));
  const codes = JSON.parse(js.match(/var CODES = (\[[^\]]*\])/)![1]);
  assertEquals([...codes].sort(), catalogs.map((c) => c.meta.code).sort());
});

Deno.test("locale preference falls back to sessionStorage when localStorage is blocked", async () => {
  const redirect = await Deno.readTextFile(new URL("../../website/redirect.js", import.meta.url));
  const site = await Deno.readTextFile(new URL("../../website/site.js", import.meta.url));
  assertStringIncludes(redirect, "sessionStorage.setItem");
  assertStringIncludes(redirect, "sessionStorage.getItem");
  assertStringIncludes(site, "sessionStorage.setItem");
});

Deno.test("locale strings are escaped, never injected as HTML", async () => {
  const evil = structuredClone(en);
  const s = evil.ui.site as Record<string, string>;
  s.deck = `<img src=x onerror=alert(1)>`;
  s.faqFreeA = `</script><script>alert(1)</script>`;
  s.downloadFor = `</script><b>{{os}}</b>`;
  const { html } = await renderPage({ catalog: evil, en, locales: [evil.meta], version: "1.0.0" });
  assert(!html.includes("<img src=x"), "deck was injected as markup");
  assertStringIncludes(html, esc(s.deck));
  assertEquals(html.match(/<script/g)?.length, html.match(/<\/script>/g)?.length);
  assert(!html.includes("<script>alert"), "a string closed a <script> element");
});

Deno.test("site.js only assigns strings with textContent", async () => {
  const js = await Deno.readTextFile(new URL("../../website/site.js", import.meta.url));
  assert(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(js));
  // Every href taken from the GitHub API goes through the host allowlist.
  assert(!/\.href = (?!githubUrl\()(?:chosen|asset|sums|release)/.test(js), "API URL assigned without githubUrl()");
});

Deno.test("site.installLinux is plain text in every locale", () => {
  for (const { meta, ui } of catalogs) {
    const blurb = (ui.site as Record<string, string>).installLinux;
    assert(!/<[^>]+>/.test(blurb), `${meta.code} site.installLinux must not contain HTML tags`);
    for (const token of ["chmod +x", ".deb", ".rpm"]) {
      assertStringIncludes(blurb, token, `${meta.code} site.installLinux is missing ${token}`);
    }
  }
});
