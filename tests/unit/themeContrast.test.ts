/// <reference lib="deno.ns" />
/**
 * Theme token WCAG contrast gates for a11y Phase 3.
 * Parses hex custom properties from src/styles/global.css — if tokens drift
 * below thresholds, these fail before merge.
 */
import { contrastRatio } from "../../src/lib/contrast.ts";

const THEME_NAMES = ["batter", "mist", "grove", "dusk", "sandstone"] as const;
type ThemeName = (typeof THEME_NAMES)[number];

const TOKEN_KEYS = [
  "--bg0",
  "--bg1",
  "--surface-solid",
  "--ink",
  "--ink-muted",
  "--accent",
  "--on-accent",
  "--danger",
] as const;
type TokenKey = (typeof TOKEN_KEYS)[number];

type ThemeTokens = Record<TokenKey, string>;

const AA_BODY = 4.5;
const AA_UI = 3.0;

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function assertRatio(
  fg: string,
  bg: string,
  min: number,
  label: string,
): void {
  const ratio = contrastRatio(fg, bg);
  assert(
    ratio >= min,
    `${label}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1 (need ≥ ${min}:1)`,
  );
}

/** Extract `[data-theme="name"] { ... }` blocks (and batter's shared `:root` block). */
function parseThemeTokens(css: string): Record<ThemeName, ThemeTokens> {
  const themes = {} as Record<ThemeName, ThemeTokens>;

  for (const name of THEME_NAMES) {
    // Batter is declared as `:root, [data-theme="batter"] { ... }`
    const re =
      name === "batter"
        ? /(?:\[data-theme="batter"\]|:root,\s*\[data-theme="batter"\])\s*\{([^}]+)\}/
        : new RegExp(`\\[data-theme="${name}"\\]\\s*\\{([^}]+)\\}`);

    const match = css.match(re);
    assert(match, `Theme block not found for "${name}"`);
    const body = match[1];
    const tokens = {} as ThemeTokens;

    for (const key of TOKEN_KEYS) {
      const tokenRe = new RegExp(`${key.replace(/-/g, "\\-")}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\b`);
      const tm = body.match(tokenRe);
      assert(tm, `Token ${key} missing or not hex in theme "${name}"`);
      tokens[key] = tm[1].toLowerCase();
    }
    themes[name] = tokens;
  }

  return themes;
}

const cssPath = new URL("../../src/styles/global.css", import.meta.url);
const css = await Deno.readTextFile(cssPath);
const themes = parseThemeTokens(css);

Deno.test("contrast helper: known WCAG pairs", () => {
  // Black on white = 21:1
  assert(
    Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 0.01,
    "black/white should be ~21",
  );
  // White on white = 1:1
  assert(Math.abs(contrastRatio("#fff", "#ffffff") - 1) < 0.01, "same color = 1");
});

for (const name of THEME_NAMES) {
  Deno.test(`theme "${name}" meets WCAG contrast thresholds`, () => {
    const t = themes[name];
    const backgrounds = [t["--bg0"], t["--bg1"], t["--surface-solid"]] as const;

    for (const bg of backgrounds) {
      assertRatio(t["--ink"], bg, AA_BODY, `${name} --ink vs ${bg}`);
      // Body-ish muted text (tagline, hints, phase label)
      assertRatio(t["--ink-muted"], bg, AA_BODY, `${name} --ink-muted vs ${bg}`);
    }

    // Accent used for links / UI chrome against page backgrounds
    assertRatio(t["--accent"], t["--bg0"], AA_UI, `${name} --accent vs --bg0`);
    assertRatio(t["--accent"], t["--bg1"], AA_UI, `${name} --accent vs --bg1`);

    // Primary button label on accent fill
    assertRatio(
      t["--on-accent"],
      t["--accent"],
      AA_BODY,
      `${name} --on-accent vs --accent`,
    );

    // --danger is text-colored (.btn-danger { color: var(--danger) })
    assertRatio(t["--danger"], t["--bg1"], AA_BODY, `${name} --danger vs --bg1`);
  });
}

console.log(
  `themeContrast: parsed ${THEME_NAMES.length} themes from global.css`,
);
