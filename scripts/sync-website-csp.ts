/// <reference lib="deno.ns" />
/**
 * Keep the GitHub Pages CSP `script-src` sha256 locked to the inline JSON-LD.
 *
 *   deno run -A ./scripts/sync-website-csp.ts
 */

const INDEX = new URL("../website/index.html", import.meta.url);
const JSON_LD_RE = /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/;
const CSP_CONTENT_RE = /http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]*)"/;
const SCRIPT_SRC_RE = /script-src\s+([^;]+)/g;
const SHA_RE = /'sha256-([^']+)'/g;

export function extractJsonLdBody(html: string): string {
  const match = html.match(JSON_LD_RE);
  if (!match) {
    throw new Error("website/index.html is missing <script type=\"application/ld+json\">");
  }
  return match[1];
}

export function extractCspSha256Tokens(html: string): string[] {
  const csp = html.match(CSP_CONTENT_RE);
  if (!csp) throw new Error("website/index.html is missing the CSP meta content");
  const scriptSrc = [...csp[1].matchAll(SCRIPT_SRC_RE)];
  if (!scriptSrc.length) throw new Error("CSP is missing script-src");
  return scriptSrc.flatMap((m) => [...m[1].matchAll(SHA_RE)].map((s) => s[1]));
}

export async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const bytes = new Uint8Array(digest);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function jsonLdCspHash(html: string): Promise<string> {
  return sha256Base64(extractJsonLdBody(html));
}

export function withUpdatedJsonLdCsp(html: string, token: string): string {
  const tokens = extractCspSha256Tokens(html);
  if (tokens.includes(token)) return html;
  if (tokens.length === 1) {
    return html.replace(`'sha256-${tokens[0]}'`, `'sha256-${token}'`);
  }
  if (tokens.length === 0) {
    return html.replace(/(script-src\s+'self')/, `$1 'sha256-${token}'`);
  }
  throw new Error(
    "CSP script-src has multiple sha256 hashes; update the JSON-LD one by hand",
  );
}

if (import.meta.main) {
  const html = await Deno.readTextFile(INDEX);
  const token = await jsonLdCspHash(html);
  const next = withUpdatedJsonLdCsp(html, token);
  if (next === html) {
    console.log(`JSON-LD CSP hash already current (sha256-${token})`);
  } else {
    await Deno.writeTextFile(INDEX, next);
    console.log(`Updated CSP JSON-LD hash to sha256-${token}`);
  }
}
