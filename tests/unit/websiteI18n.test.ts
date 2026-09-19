/// <reference lib="deno.ns" />
/**
 * GitHub Pages must not inject locale strings as HTML (security.md L5).
 */

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
