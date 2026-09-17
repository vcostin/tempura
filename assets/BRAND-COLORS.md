# Tempura brand colors

Source of truth: the shrimp mark in `assets/shrimp-mark.svg` and the sage squircle in `assets/app-icon.svg`. Batter (the default theme) is this palette, not a contrast-tuned substitute.

Do not darken the gold to brown (e.g. `#8f4f18`) to chase small-text contrast. Keep `#C47A2C` for fills, glow, wordmark accent, and the Start button. Put dark type on the gold (`--on-accent`) when a label needs AA.

## Mark

| Role | Hex | Where |
|------|-----|--------|
| Golden batter | `#C47A2C` | Shrimp body (`fill`) |
| Pink tip | `#B85A6A` | Shrimp outline (`stroke`) |
| Sage squircle | `#D8E2DA` | App icon background |
| Charcoal | `#1E2A32` | Ink / wordmark |

## Batter tokens

Shipped in `src/styles/global.css` (`:root, [data-theme="batter"]`) and `website/styles.css`.

| Token | Hex | Use |
|-------|-----|-----|
| `--accent` | `#c47a2c` | Brand gold — never replace with a brown |
| `--ring` | `#d4924a` | Progress ring (lighter gold) |
| `--accent-soft` | `rgba(196, 122, 44, 0.16)` | Soft gold wash |
| `--on-accent` | `#1a242c` | Label on gold fills (app) |
| `--bg0` | `#d8e2da` | Sage page |
| `--bg1` | `#e8efea` | Sage lift |
| `--bg2` | `#c5d1c8` | Sage shade |
| `--ink` | `#1e2a32` | Charcoal |
| `--ink-muted` | `#53645f` | Secondary text |
| `--surface-solid` | `#f4f8f5` | Solid chips / fields |
| `--danger` | `#b85a6a` | Tip pink (website); app may use a darker cousin for body-text AA |

Geometry credit: `assets/ICON-ATTRIBUTION.txt`.
