/// <reference lib="deno.ns" />
/**
 * Gate: html font-size must remain a percentage (or inherit) so rem UI
 * tracks OS / webview text scaling — never a hard-coded px lock from our CSS.
 */

Deno.test("global.css sets html { font-size: 100% }", async () => {
  const cssPath = new URL("../../src/styles/global.css", import.meta.url);
  const css = await Deno.readTextFile(cssPath);

  // Prefer the shipped rule; allow whitespace/comments between selector and brace.
  const htmlFontSize = /html\s*\{[^}]*font-size\s*:\s*([^;]+);/s.exec(css);
  if (!htmlFontSize) {
    throw new Error("No html { font-size: ... } rule found in global.css");
  }

  const value = htmlFontSize[1].trim();
  if (value !== "100%") {
    throw new Error(
      `Expected html font-size: 100% (OS scaling), got "${value}". ` +
        "Do not lock rem UI to a fixed px root.",
    );
  }

  // Guard against a later override that re-locks the root.
  const allHtmlFontSizes = [
    ...css.matchAll(/html\s*\{[^}]*font-size\s*:\s*([^;]+);/gs),
  ].map((m) => m[1].trim());
  const bad = allHtmlFontSizes.filter((v) => !v.endsWith("%") && v !== "inherit");
  if (bad.length > 0) {
    throw new Error(`html font-size must be % or inherit; found: ${bad.join(", ")}`);
  }
});
