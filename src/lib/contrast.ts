/**
 * WCAG 2.x relative-luminance contrast helpers (sRGB).
 * Pure TypeScript — no Node-only deps.
 */

export type Rgb = { r: number; g: number; b: number };

/** Parse `#rgb` / `#rrggbb` (case-insensitive). Throws on invalid input. */
export function parseHexColor(hex: string): Rgb {
  const raw = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance per WCAG 2 (0–1). */
export function relativeLuminance(color: string | Rgb): number {
  const { r, g, b } = typeof color === "string" ? parseHexColor(color) : color;
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

/**
 * Contrast ratio between two colors (always ≥ 1).
 * `(Llighter + 0.05) / (Ldarker + 0.05)`
 */
export function contrastRatio(foreground: string | Rgb, background: string | Rgb): number {
  const L1 = relativeLuminance(foreground);
  const L2 = relativeLuminance(background);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}
