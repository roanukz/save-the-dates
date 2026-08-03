# Design system

Direction A: cool grey neutrals, anodised teal primary, 6px radius, 1.25 type ratio,
system fonts only.

The raw values live in [tokens.css](tokens.css). This file is the reasoning — what each
value is for, and which rules must not be broken. The original handoff is in
[design/](design/) for provenance.

**The hard constraint that overrides convenience: no third-party runtime request of any
kind.** No Google Fonts, no CDN, no webfonts, no icon fonts, no analytics, no external
CSS, no `@import url()`. A single third-party request visible in devtools breaks the
product's promise that nothing leaves your computer. Everything ships from this folder
or inline.

---

## Colour

Eight ramps: one neutral, one primary, five semantics, one accent. Eleven steps each,
except accent, which needs five.

Nothing in the app reads a raw ramp value. Everything reads a **role token**
(`--text-body`, `--surface`, `--warning-tint`), so dark mode is a matter of remapping
roles rather than rewriting components.

### Step mapping — light

| Role | Neutral | Primary | Semantic |
|---|---|---|---|
| Page background | 50 | — | — |
| Surface (card, tile, row) | `#ffffff` | — | 50 |
| Sunken / table header | 100 | — | — |
| Border subtle (divider) | 200 | — | 200 |
| Border default (control) | 300 | — | 300 |
| Border strong / hover | 400 | — | 400 |
| Muted text | 500 | — | — |
| Body text | 700 | 700 | 600 (notice 700) |
| Heading text | 900 | — | — |
| Interactive fill | — | 600 | 600 |
| Fill hover / pressed | 100 / 200 | 700 / 800 | 700 / 800 |
| Focus ring | — | 400 | — |
| Disabled fill / text | 200 / 400 | — | — |
| Banner left bar | — | — | 600 |

Fill borders are always one step darker than the fill. **Hover always goes darker in
light mode.**

### Step mapping — dark

Not an inversion. Follow this table, not your instincts.

| Role | Neutral | Primary | Semantic |
|---|---|---|---|
| Page background | 950 | — | — |
| Surface | 900 | — | 900 |
| Raised surface (elevation 2) | 800 | — | — |
| Border subtle / default / strong | 800 / 700 / 600 | — | 700 |
| Muted / body / heading text | 400 / 200 / 50 | — | — |
| Interactive fill / hover | — | 500 / 400 | 500 / 400 |
| Interactive text, link | — | 300 | — |
| Focus ring | — | 300 | — |
| Semantic tint background | — | — | 900 |
| Semantic icon + text | — | — | 300 (notice 200) |
| Semantic solid fill | — | — | 400 fill, neutral-950 text |
| Disabled fill / text | 800 / 600 | — | — |

Five deliberate divergences:

1. **Hover goes lighter**, the opposite of light mode.
2. **Semantic tints use step 900, never 950** — at 950 every ramp is indistinguishable
   from the page.
3. **Notice inverts its own exception** — darker than the other semantics in light mode
   (700), lighter here (200). Low-chroma slate loses legibility on dark faster than
   saturated hues do.
4. **Elevation is surface lightness, not shadow.** Shadows are invisible on 950.
5. **Text on a semantic solid fill flips** from white to neutral-950.

`prefers-color-scheme` only. No dark-mode toggle, no stored preference — there is
nothing worth persisting for someone who visits once.

### Notice — the fifth semantic

The most portable idea in this system. Info's hue at roughly a third of the chroma, so
it lands *near* the neutral ramp without touching it: visibly a message, visibly not a
status. For factual disclosures that are neither problems nor confirmations.

Its text step is **700, not 600**. At 600 it reads as ordinary body text.

### Accent — brass, measurement only

Champagne brass at hue 84. Two roles only: the proportional bars in the summary tiles,
and the signature moment. **Never status, never interaction** — at 84° it sits inside
warning's neighbourhood and would be read as a caution.

---

## Never encode meaning in hue alone

Every status carries **hue + a 16px icon + a text word.**

Acceptance test: remove all colour and every state must still be readable. The unmatched
table row carries four non-colour signals — a 4px left bar (warning gets 3px), the X
icon, the words "Couldn't match", and a dotted underline plus 650 weight on the filename.

The icon set is **closed at eight**. A ninth icon means a new meaning, and a new meaning
needs a new word first. Shape-level distinguishability is deliberate: notice is the only
square, warning the only triangle; info, success and error are circles differing in their
interior mark.

---

## Type

Two families, no external request. Mono is used **only** for filenames and hex values —
someone checking whether the right file was touched needs unambiguous `l/1/I` and `0/O`.

Six sizes, ratio 1.25 (major third). **Letter-spacing is per size**, tightening as size
grows; one global tracking value is the usual reason generated scales feel bunched at
display sizes.

| px | line-height | letter-spacing | weight | measure | use |
|---|---|---|---|---|---|
| 39 | 44px | −0.024em | 650 | 20ch | summary-tile hero number, one per screen |
| 31 | 37px | −0.020em | 650 | 28ch | page title |
| 25 | 31px | −0.016em | 650 | 40ch | section heading; tile number at 360px |
| 20 | 27px | −0.011em | 600 | 52ch | card title, lead paragraph, banner headline |
| 16 | 25px | 0 | 400 / 600 | **66ch** | body, button labels, table cells — the floor |
| 13 | 19px | +0.006em | 400 / 650 | 40ch | tile labels, eyebrows, timestamps. **Never prose.** |

The tracking is one value per size, tuned to sit between SF and Segoe, leaving Roboto
marginally tight at the largest size. **Do not add `@supports` font-detection hacks.**

**Tabular numerals on every number** in tiles, table and progress. Not supported by
Helvetica Neue, Arial or Liberation Sans — the tail of the stack — so numeric columns are
*also* right-aligned with a fixed `ch` width, and alignment survives the feature silently
doing nothing.

---

## Spacing, shape, elevation

**Spacing — 4px base:** `2, 4, 8, 12, 16, 24, 32, 48, 64, 96`. 4px rather than 8px
because 12px is the most-used inset in this product (table cell, banner, tile padding)
and an 8px scale cannot express it without half-steps. 4px also lets a compact control
land on 40px and a primary control on 48px, clearing the 44px touch target from both
sides.

**Shape:** `6px` on every control and small surface; `10px` only on containers wider than
about 480px. **Banned: 999px pills** (reads as marketing) and **0px** (reads unfinished
against a 1px cool border).

**Elevation — two levels.** Level 1: cards, tiles, table. Level 2: only the sticky
progress panel and the expanded-table header. Shadow colour is neutral-950 at low alpha,
never pure black. In dark mode, use surface lightness instead.

---

## Components

**Buttons.** `padding: 12px 16px`, 16px label, `line-height: 1.25`, `gap: 8px`, radius
6px, 1px border one step darker than the fill, icon 16px **always with a text label,
never icon-alone**. Total height 44px — the touch-target floor hit exactly.

- **One focus ring everywhere** — 2px primary-400 at 2px offset, on primary, secondary
  and destructive alike. `:focus-visible` only. **Never `outline: none`.**
- **Loading keeps the width.** Label swaps to a present participle, icon swaps to the
  rotating arc, padding and font unchanged so the button never resizes mid-action. Set
  `aria-busy="true"` and keep focus on the button.
- **Destructive has no loading state** (the action is instant and local; a spinner
  invites a second click) and **asks twice** — the only button in the system that does.

**Link.** primary-700, 1px underline at `text-underline-offset: 2px`, **always
underlined** — colour alone is not a link signal.

**Notice banner.** notice-50 background, 1px notice-200 border, `border-left: 3px solid
notice-600`, radius 6px, `padding: 12px 14px`, `gap: 9px`.

Copy rules that travel with the colour:

- The label is always **"Good to know"** — never "Note", "Warning", or "Heads up".
- A notice **names the fact and then says what happens to the user's files.** "Can't be
  fixed" alone is frightening; "left exactly as they are" is the half that removes the
  fear.

**Error copy shape — mandatory, three parts:** what happened → what happened to your data
→ the fix.

---

## Motion

**Exactly one signature micro-interaction ships: the tally tick.** During the wait, a
changed tally number fades up 3px into place over 120ms, `cubic-bezier(0.2,0,0,1)`,
throttled to at most **one tick per tile per 400ms**. Without the throttle, fast machines
flicker.

Declared opt-in, so the static version is the default and the animation is the
enhancement:

```css
@media (prefers-reduced-motion: no-preference) { /* transition declared here */ }
```

The progress arc and bar sheen are separate — they are *liveness*, not signature — and
they also stop under `prefers-reduced-motion: reduce`.

**No other animation anywhere.** No bounce, no sound, no confetti, no emoji, no page
transitions, no scroll effects.

---

## Contrast

[contrast-check.html](contrast-check.html) computes every ratio in the system at runtime
and reports PASS / FAIL / EXEMPT against WCAG 2.2 AA. **This spec deliberately contains
no contrast numbers** — that page is the only source of them.

When it reports a failure, **do not silently adjust a hex.** The fix is almost always
"move one step darker or lighter in the same ramp", and that changes the step-mapping
table, which is a design decision — not a value you nudge until the checker turns green.

---

## Portable vs tuned

**Portable — reuse unchanged:** all eight ramps and both step-mapping tables · the type
scale, per-size letter-spacing, system-only fonts and tabular numerals · the 4px spacing
scale, 6px/10px radii, two elevations, the pill ban · the single focus ring on every
control type · the three button geometries and their five states · the icon rules ·
never-hue-alone · **notice as a fifth semantic** · the error-copy shape.

Three rules were promoted from tuned to core, because they are conditions rather than
taste: **progress detail scales with duration** (1s / 10s / 60s thresholds), **confirm
destructive actions when and only when there is no undo**, and **every failure state
names what happened to the user's data**.

**Tuned to anxious, one-shot users — re-decide per product:** summary-tiles-over-table
(wrong where the table *is* the product) · which rung of the progress ladder you land on ·
"Nothing is uploaded" above the fold and how often it is repeated · paged 50 rows instead
of virtual scroll · the signature moment's *placement* · the brass accent itself, though
its *role* — measurement, never status — is portable.

---

## Where this borrows from Apple, and where it diverges

**Borrowed knowingly:** the cool grey neutral scale and negative tracking at display
sizes · icon + text label on every action, never icon-alone (Photos) · summary-first with
detail one click behind, distraction stripped (News) · a 6px control radius · system fonts
as a first-class decision rather than a fallback.

**Diverged deliberately:** teal instead of system blue, so blue stays available for info
and notice · a fifth semantic Apple has no equivalent for · no translucency, vibrancy or
blur anywhere (they cost contrast you cannot verify, and GPU time on old machines) ·
stroked icons at every size instead of filled-at-small-sizes pairs · brass as a
measurement accent, which is not an Apple move · and a progress state built on five
redundant liveness signals where Apple would show one confident bar.

That last is the biggest divergence. Apple designs as though the machine will not
disappoint you. This tool runs on the user's hardware and sometimes will.

---

## Product profile: Takeout Fixer

| | |
|---|---|
| Audience and stakes | Non-technical people migrating irreplaceable photos. One visit, no account, no second chance. |
| Primary surface | Summary tiles carrying the decision-level facts. The full table is a drill-down, collapsed by default. **Success is a user who never opens it.** |
| Progress rung | Full five-signal — this runs for minutes. |
| Destructive confirms | Yes. Results are irreplaceable and there is no undo. |
| Privacy claim | "Nothing is uploaded" above the fold on the first screen, restated in the working state. |
| Detail disclosure | Collapsed by default; paged 50 rows, never virtual scroll — a paged list has an end, an infinite list of your own broken files does not. Below 720px the table becomes stacked blocks. |
| Signature moment | The tally tick, during the multi-minute wait. The wait is where trust is lost, so that's where the one moment goes. |
| Accent role | Brass as measurement only — the proportional bars in the tiles. |
| Deviations from core | One, recorded below. |

### Deviation: the timezone notice copy

The handoff's example notice copy reads *"Dates are converted to your computer's current
timezone."* **That sentence is false for this product and is not used.**

Takeout Fixer works out the timezone from each photo's GPS position and never consults
the computer's clock. Shipping the handoff's wording would tell users something untrue
about what was written into their photos. The notice keeps its visual treatment and the
existing, accurate disclosure text.

The one place the computer's own timezone *is* correct to use is the "date modified"
stamp on files inside the download zip, which is a filesystem fact rather than a
photographic one. See `zipDateFor` in [app.js](app.js).
