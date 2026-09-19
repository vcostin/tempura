/// <reference lib="deno.ns" />
/**
 * GitHub Pages must not inject locale strings as HTML (security.md L5).
 */
import { extractCspSha256Tokens, jsonLdCspHash } from "../../scripts/sync-website-csp.ts";

Deno.test("download site does not innerHTML locale strings", async () => {
  const i18n = await Deno.readTextFile(new URL("../../website/i18n.js", import.meta.url));
  const html = await Deno.readTextFile(new URL("../../website/index.html", import.meta.url));

  if (html.includes("data-i18n-html")) {
    throw new Error("website/index.html must not use data-i18n-html");
  }
  if (i18n.includes("data-i18n-html")) {
    throw new Error("website/i18n.js must not read data-i18n-html");
  }
  if (/innerHTML\s*=\s*i18next/.test(i18n)) {
    throw new Error("website/i18n.js must not assign i18next output to innerHTML");
  }
  if (/escapeValue:\s*false/.test(i18n)) {
    throw new Error("website i18next interpolation must not disable HTML escaping");
  }
  if (!/data-i18n="site\.installLinux"/.test(html)) {
    throw new Error("Linux install blurb must use data-i18n (textContent)");
  }
});

Deno.test("CSP sha256 matches the JSON-LD script body", async () => {
  const html = await Deno.readTextFile(new URL("../../website/index.html", import.meta.url));
  const token = await jsonLdCspHash(html);
  const allow = extractCspSha256Tokens(html);
  if (!allow.includes(token)) {
    throw new Error(
      `CSP script-src sha256 does not match the JSON-LD body (got ${
        allow.map((t) => `'sha256-${t}'`).join(" ") || "none"
      }, expected 'sha256-${token}'). update the CSP sha256 in website/index.html (or run scripts/sync-website-csp.ts)`,
    );
  }
});

Deno.test("download site has canonical, share, and twitter metas", async () => {
  const html = await Deno.readTextFile(new URL("../../website/index.html", import.meta.url));
  const i18n = await Deno.readTextFile(new URL("../../website/i18n.js", import.meta.url));
  const origin = "https://vcostin.github.io/tempura/";
  for (const needle of [
    `rel="canonical" href="${origin}"`,
    `property="og:url" content="${origin}"`,
    `name="twitter:card" content="summary_large_image"`,
    `name="twitter:title"`,
    `name="twitter:description"`,
    `name="twitter:image" content="https://vcostin.github.io/tempura/shots/timer.png"`,
    `type="application/ld+json"`,
  ]) {
    if (!html.includes(needle)) {
      throw new Error(`website/index.html is missing ${needle}`);
    }
  }
  if (!html.includes("SoftwareApplication") || !html.includes("releases/latest")) {
    throw new Error("JSON-LD should be SoftwareApplication with latest Releases downloadUrl");
  }
  if (!i18n.includes('meta[name="twitter:title"]') || !i18n.includes('meta[name="twitter:description"]')) {
    throw new Error("i18n.js must update twitter title and description on locale change");
  }
});

Deno.test("site.installLinux is plain text in every locale", async () => {
  const root = new URL("../../locales/", import.meta.url);
  const tagged: string[] = [];
  for await (const dir of Deno.readDir(root)) {
    if (!dir.isDirectory) continue;
    let ui: { site?: { installLinux?: string } };
    try {
      ui = JSON.parse(await Deno.readTextFile(new URL(`${dir.name}/ui.json`, root)));
    } catch {
      continue;
    }
    const blurb = ui.site?.installLinux;
    if (typeof blurb !== "string") continue;
    if (/<[^>]+>/.test(blurb)) tagged.push(`${dir.name}: ${blurb}`);
    for (const token of ["chmod +x", ".deb", ".rpm"]) {
      if (!blurb.includes(token)) {
        throw new Error(`${dir.name} site.installLinux is missing ${token}`);
      }
    }
  }
  if (tagged.length) {
    throw new Error(`site.installLinux must not contain HTML tags:\n${tagged.join("\n")}`);
  }
});
