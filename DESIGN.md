# QScoring Design System

Single source of truth for visual tokens and usage rules. Derived from the live
`:root` custom properties in `app/globals.css` — if a value here and the CSS ever
disagree, **`globals.css` wins** and this file is the thing to fix.

Direction: **"Precision Terminal"** — a dark navy chrome with a disciplined gold
accent and a fixed green/amber/red signal palette for data. Institutional,
high-contrast, data-dense.

---

## The one rule that matters most

**Gold is chrome. The signal palette is data.**

- **Gold** (`--gold`, `--gold-bright`) is for *interface chrome only*: primary CTAs,
  eyebrows, focus rings, badges/pills, the active-nav accent. It must **not** be used
  to encode a score or signal.
- **Signal colors** (green / amber / red) are for *data*: score rings, factor bars,
  buy/hold/short signal pills, deltas. They carry meaning — never use them decoratively.

Getting this backwards (e.g. a green primary button) makes the UI read as if a control
is conveying a bullish signal. Don't.

---

## Color tokens

All defined on `:root` in `app/globals.css`.

### Surfaces (navy chrome)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#0A0E17` | Page background |
| `--bg-2` | `#0F172A` | Secondary background band |
| `--bg-card` | `#141C2E` | Card / panel surface |
| `--bg-card-hover` | `#1C2740` | Card hover surface |
| `--surface` | `#1A2238` | Raised surface |
| `--surface-2` | `#1E293B` | Higher raised surface |

### Gold — chrome only (CTAs, eyebrows, focus, badges)
| Token | Value | Use |
|---|---|---|
| `--gold` | `#F59E0B` | Primary CTA background, chrome accent |
| `--gold-bright` | `#FBBF24` | Eyebrows, CTA hover, focus outline |
| `--gold-dim` | `rgba(245,158,11,0.12)` | Subtle gold tint (borders, fills) |
| `--gold-soft` | `rgba(245,158,11,0.22)` | Stronger gold tint / glow |
| `--on-gold` | `#1C1409` | Text/icon **on** a gold surface |

### Signal palette — data only (locked to score-band semantics)
| Token | Value | Meaning |
|---|---|---|
| `--signal-buy` | `#34D399` | Buy / bullish |
| `--signal-hold` | `#FBBF24` | Hold / neutral |
| `--signal-short` | `#F87171` | Short / bearish |

Each has a `-dim` (≈12% alpha) and the buy/short have `-soft` (≈22%) tint variants.

### Legacy aliases
`--accent`, `--red`, `--amber` are **aliases onto the signal palette** so existing data
selectors keep working without edits:
- `--accent` → `--signal-buy` (green) · `--accent-dim` → buy-dim · `--accent-glow` → buy-soft
- `--red` → `--signal-short` · `--amber` → `--signal-hold`

> Note: `--accent` is **green, not gold**. For chrome, use the gold tokens explicitly.

### Text & lines
| Token | Value | Use |
|---|---|---|
| `--text` | `#F8FAFC` | Primary copy |
| `--text-dim` | `#CBD5E1` | Secondary copy |
| `--text-muted` | `#778999` | Tertiary — eyebrows, timestamps (≥4.7:1 on bg-card, WCAG AA) |
| `--border` | `rgba(255,255,255,0.09)` | Dividers, card outlines |
| `--border-strong` | `rgba(203,213,225,0.16)` | Emphasis borders |

**Rule:** never hardcode a hex/rgba color in a component — always use a token. If the
right token doesn't exist, add it to `:root` (and this file) first.

---

## Typography

| Token | Value |
|---|---|
| `--font` | `Inter` → system sans |
| `--mono` | `JetBrains Mono` → system mono |

Mono is for **all numbers**: scores, metric values, ticker symbols, prices,
timestamps, and anything that benefits from tabular alignment. Eyebrows and small
"terminal" labels use mono + uppercase + letter-spacing.

---

## Motion

| Token | Value |
|---|---|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `--dur-fast` | `150ms` |
| `--dur-base` | `200ms` |

Animate compositor-friendly properties (transform, opacity). CTAs lift on hover
(`translateY(-1px)`) and brighten to `--gold-bright`.

---

## Component conventions

- **Primary button / CTA** (`.nav-cta` pattern): `background: var(--gold)`,
  `color: var(--on-gold)`, hover → `--gold-bright` + 1px lift + gold glow.
- **Eyebrow** (`.method-eyebrow` pattern): `font-family: var(--mono)`, uppercase,
  letter-spaced, `color: var(--gold-bright)`.
- **Signal tone** classes map a signal to the data palette:
  `bullish → --accent` (green), `neutral → --amber`, `bearish → --red`.
- **Cards/panels**: `--bg-card` surface, 1px `--border`, ~12–14px radius. Depth comes
  from tonal surface tiers, not heavy drop shadows.
- **Numbers** render in `--mono`.

---

## Billing note

The Pro tier is Stripe-backed and gated by `STRIPE_BILLING_ENABLED` in
`lib/feature-flags.ts` (with `users.tier = 'pro'`). The pricing surface lives at
`/pricing`.
