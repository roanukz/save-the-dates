# Handoff: Takeout Fixer Design System (Direction A)

## Overview
A personal, reusable design system built around one worked example: **Takeout Fixer**, a free
client-side tool that reads the JSON sidecar files in a Google Takeout export and writes the
original capture date back into each photo's EXIF. The system is intended for reuse across many
small, free, single-purpose utilities, so this bundle marks every decision as either
**PORTABLE** (reuse unchanged) or **TUNED** (re-decide per product) — see §14 of the visual spec
and the "Portable vs tuned" section below.

Direction chosen by the owner: **A — cool gray neutrals, anodized teal primary, 6px radius,
1.25 type ratio, system fonts only.** (Direction B, a barely-warm neutral with a serif display
face and brass primary, was rejected. Both are preserved in the spec file under badge \`1a\` / \`1b\`.)

## What you are being asked to write

**In this repo, produce two files that do not exist yet:**

1. **\`tokens.css\`** — every value in "Design Tokens" below, as CSS custom properties, with a
   \`@media (prefers-color-scheme: dark)\` block implementing the dark step mapping. The dark
   mapping is **not** an inversion; follow the dark table exactly.
2. **\`DESIGN.md\`** — the human-readable rules: step mapping, type scale with per-size
   letter-spacing, spacing scale, the never-hue-alone rule, the copy rules, and the
   portable/tuned split.

**Also produce:**

3. **\`contrast-check.html\`** — a standalone, zero-dependency page that computes every contrast
   ratio at runtime. Full specification in \`CONTRAST-CHECK-SPEC.md\` in this bundle. **This is
   not optional and must not be replaced by hardcoded ratios.** The spec deliberately contains
   no contrast numbers; the owner will run this page and report failures.

**Both previously-open decisions are now closed** — see \`DECISIONS.md\`: summary tiles use
option ii (bordered tiles with a brass proportional bar) and the signature moment is the tally
tick during the wait. Implement those and delete the alternatives.

The owner’s stated preference is **portable**: ship the system as a core plus a thin per-product
profile. See \`CORE-AND-PROFILE.md\` for what belongs in each, and for Takeout Fixer’s profile.

## About the design files
\`Takeout Fixer Design System.dc.html\` in this bundle is a **design reference created in HTML** —
a one-page visual spec showing intended color, type, spacing and component states. It is not
production code to copy. Recreate the components in the target codebase's own environment using
its established patterns; if the target has no framework yet, plain HTML + CSS with no build step
is the correct choice here, because the product's core promise is that nothing leaves the browser.

**Hard constraint that overrides convenience:** *no third-party runtime requests of any kind.*
No Google Fonts, no CDN, no webfonts, no icon fonts, no analytics, no external CSS, no
\`@import url()\`. A single third-party request visible in devtools breaks the product's promise.
Everything ships from the same origin or inline.

## Fidelity
**High-fidelity.** Every color, size, letter-spacing, radius, border and copy string in the spec
is final and literal. Reproduce exact values.

## Design Tokens

### Neutral — hue 218°, cool (chroma 0.004 → 0.022 at 500 → 0.010)
| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| #f7f8f9 | #eef0f3 | #dfe3e8 | #c8ced7 | #9aa3b0 | #6f7887 | #545c6b | #3f4653 | #2b313b | #1b2028 | #10141a |

Plus \`--surface: #ffffff\` — white sits outside the ramp and is its own token.

### Primary — anodized teal, hue 197°
| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| #eef6f8 | #d7ebf0 | #b0d8e2 | #7fbdcd | #4c9bb0 | #2b7d94 | #1f6379 | #1a4f60 | #163f4c | #13333d | #0b2129 |

### Success — hue 152°
| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| #eef7f1 | #d6ecdd | #aedbbe | #7cc39a | #4aa576 | #2d885c | #1f6d49 | #1a583c | #164631 | #123829 | #0a2319 |

### Warning — hue 76°
| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| #fdf6e8 | #fae9c6 | #f3d38c | #e6b54d | #cf9722 | #ab7a13 | #8a610f | #6f4e0e | #573e0d | #46320c | #2b1e06 |

### Error — hue 26°
| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| #fdf2f0 | #fbdfda | #f5bcb2 | #ea9384 | #d96450 | #c04430 | #a13425 | #832b1f | #68231a | #551d16 | #33110c |

### Info — hue 262°
| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| #eff4fe | #dbe6fd | #b9cdfa | #8eabf3 | #6285e6 | #4162cf | #304ca8 | #293e86 | #22336b | #1d2a56 | #111935 |

### Notice — hue 258°, chroma capped ~0.045 (the least saturated semantic, on purpose)
| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| #f1f3f7 | #e2e7ef | #c8d2e0 | #a7b4c9 | #8290ab | #66748f | #4f5c74 | #3f4a5e | #333b4b | #2a303d | #191d26 |

Notice is info's hue at roughly one third the chroma. It lands *near* the neutral ramp without
touching it: visibly a message, visibly not a status. **Its text/icon step is 700, not 600** —
at 600 it reads as body text. Used for factual disclosures that are neither problems nor
confirmations ("Dates are converted to your computer's current timezone").

### Accent — champagne brass, hue 84°, 5 steps only
| 100 | 200 | 400 | 600 | 800 |
|---|---|---|---|---|
| #faf7ee | #e6d9b3 | #c2a862 | #8f7833 | #5f5027 |

Both accent slots go to this one hue in two roles: **400/600 for the proportional bars in the
summary tiles**, **200 for the signature moment**. Never for status, never for interaction — at
84° it is inside warning's neighborhood.

### Step mapping — LIGHT
| Role | Neutral | Primary | Semantic |
|---|---|---|---|
| Page background | 50 | — | — |
| Surface (card, tile, row) | #ffffff | — | 50 |
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

Fill borders are always one step darker than the fill. Hover always goes **darker** in light mode.

### Step mapping — DARK (not an inversion)
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

Three divergences to implement carefully:
1. **Hover goes lighter in dark mode**, the opposite of light mode.
2. **Semantic tints use step 900, never 950** — at 950 every one of these ramps is
   indistinguishable from neutral-950.
3. **Notice inverts its own exception**: darker than the other semantics in light mode (700),
   *lighter* in dark mode (200), because low-chroma slate loses legibility on dark faster than
   saturated hues do.
4. Elevation in dark mode is surface lightness, not shadow. Shadows are invisible on 950.
5. Text on semantic solid fills flips from white (light) to neutral-950 (dark).

\`prefers-color-scheme\` only. **No dark-mode toggle UI, no stored preference** — there is nothing
worth persisting for a user who visits once.

### Type
Two families, no external requests:

\`\`\`css
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Text', 'Segoe UI',
             system-ui, Roboto, 'Helvetica Neue', Arial, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
\`\`\`

Mono is used **only** for filenames and hex values — a user checking whether the right file was
touched needs unambiguous l/1/I and 0/O.

Six sizes, ratio **1.25** (major third). Letter-spacing is **per size**, tightening as size
grows — a single global value is the usual reason generated scales feel bunched at display sizes.

| px | line-height | letter-spacing | weight | measure | use |
|---|---|---|---|---|---|
| 39 | 1.12 / 44px | −0.024em | 650 | 20ch | summary-tile hero number, one per screen |
| 31 | 1.18 / 37px | −0.020em | 650 | 28ch | page title |
| 25 | 1.25 / 31px | −0.016em | 650 | 40ch | section heading; tile number at 360px |
| 20 | 1.35 / 27px | −0.011em | 600 | 52ch | card title, lead paragraph, banner headline |
| 16 | 1.55 / 25px | 0 | 400 / 600 | **66ch** | body, button labels, table cells — the floor |
| 13 | 1.45 / 19px | +0.006em | 400 / 650 | 40ch | tile labels, eyebrows, timestamps. **Never prose.** |

Font-resolution notes (the scale is *not* tuned only for SF):
- **SF** (\`-apple-system\`): system-ui switches to the SF Display optical cut above ~20px on its
  own, so 25/31/39 get optical tightening on top of the tracking above. The reference rendering.
- **Segoe UI Variable Text / Segoe UI**: the Display optical cut is a *separate family name* this
  stack cannot reach, so 39px renders on the Text cut and reads looser than SF — it wants about
  −0.030em. Segoe is narrower, so a 66ch measure comes out ~8% shorter in px.
- **Roboto**: already tighter by default, so −0.024em at 39px goes past tight into cramped — it
  wants about −0.014em. Smaller proportional x-height means 13px reads a size down, which is why
  13px is restricted to metadata.
- **Chosen compromise:** one tracking value per size, tuned to sit between SF and Segoe, leaving
  Roboto marginally tight at the largest size. Do **not** add \`@supports\` font-detection hacks.

**Tabular numerals** on every number in tiles, table and progress:
\`font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1;\`
Supported by SF, Segoe UI, Segoe UI Variable, Roboto. **Not** supported by Helvetica Neue, Arial,
Liberation Sans — the tail of the stack. Therefore numeric columns are **also**
\`text-align: right\` with a fixed \`ch\` width, so alignment survives the feature silently
doing nothing.

### Spacing — 4px base
\`2, 4, 8, 12, 16, 24, 32, 48, 64, 96\`

4px rather than 8px because **12px is the most-used inset in this product** (table cell padding,
banner padding, tile padding) and an 8px scale cannot express it without half-steps. 4px also
lets a compact control land on 40px and a primary control on 48px, clearing the 44px touch
target from both sides. Assignments: 4 icon-to-label · 8 inside a control · 12 cell and banner
padding · 16 card padding (mobile), gap between tiles · 24 card padding (desktop) · 32 between
sections · 48 major break · 64 page top (desktop) · 96 around the first-screen drop zone.

### Shape
- \`--radius: 6px\` on every control and small surface.
- \`--radius-lg: 10px\` **only** on containers wider than ~480px.
- **Banned: 999px pills** (reads as marketing) and **0px** (reads unfinished against a 1px cool border).

### Elevation — two levels
\`\`\`css
--elev-1: 0 1px 2px rgba(16,20,26,0.06), 0 1px 1px rgba(16,20,26,0.04);
--elev-2: 0 4px 12px rgba(16,20,26,0.10), 0 1px 2px rgba(16,20,26,0.06);
\`\`\`
Level 1: cards, tiles, table. Level 2: only the sticky progress panel and the expanded-table
header. Shadow color is neutral-950 at low alpha, never pure black. In dark mode use surface
lightness instead (900 / 800).

## Assets — the eight icons
Inline SVG only. No icon font, no sprite sheet, no runtime fetch. Every icon:
\`viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"
stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"\`, rendered at 16px (24px for
headers). The set is **closed at eight** — a ninth icon means a new meaning, and a new meaning
needs a new word first.

| name | paths | always paired with |
|---|---|---|
| success | \`<circle cx="8" cy="8" r="6.25"/><path d="m5.25 8.25 1.9 1.9 3.6-4.1"/>\` | "Fixed" |
| error | \`<circle cx="8" cy="8" r="6.25"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"/>\` | "Couldn't match" / "Couldn't read" |
| warning | \`<path d="M8 2.2 14.4 13.3H1.6Z"/><path d="M8 6.4v3.1"/><path d="M8 11.5h.01"/>\` | "No metadata" |
| notice | \`<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2.5"/><path d="M5 6.25h6M5 9.25h4"/>\` | "Good to know" |
| info | \`<circle cx="8" cy="8" r="6.25"/><path d="M8 7.2v4"/><path d="M8 4.9h.01"/>\` | "How this works" |
| folder | \`<path d="M1.75 4.75A1.5 1.5 0 0 1 3.25 3.25h2.4l1.3 1.6h5.8a1.5 1.5 0 0 1 1.5 1.5v6.4H1.75Z"/>\` | "Choose folder" |
| download | \`<path d="M8 2v8"/><path d="M4.5 7 8 10.5 11.5 7"/><path d="M2.5 13h11"/>\` | "Download …" |
| in-progress | \`<circle cx="8" cy="8" r="6.25" stroke="{primary-200}"/><path d="M8 1.75A6.25 6.25 0 0 1 14.25 8"/>\` | "Fixing…" / "Preparing…" |

Shape-level distinguishability is deliberate: **notice is the only square, warning the only
triangle, info and success and error are circles differing in interior mark.** They remain
separable with color removed.

## Never encode meaning in hue alone
Every status carries hue **+ a 16px icon + a text word**. Acceptance test: remove all color and
every state must still be readable. The unmatched table row carries four non-color signals —
a **4px** left bar (warning gets 3px), the X icon, the words "Couldn't match", and a dotted
underline plus 650 weight on the filename.

## Screens / Views

### 1. First screen — drop zone
Purpose: the whole relationship. Three states, distinguished by **border treatment** as well as
color, so they survive grayscale.

- **Idle** — \`2px dashed\` neutral-400, radius 10px, background neutral-50, padding 32px 24px,
  centered. 32px folder icon (stroke 1.3 at that size), 20px headline "Drag your Takeout folder
  here", 16px neutral-600 "Nothing is uploaded.", then the secondary button "Choose folder".
  The privacy line sits **above** the button, not in fine print.
- **Drag-over** — \`2px solid\` primary-500 + \`inset 0 0 0 4px\` primary-100, background
  primary-50. Headline "Release to read this folder"; subline names the folder
  ("Takeout 2024-06-11") so the user can confirm before letting go. Button goes to primary-100
  fill / primary-200 border / primary-800 text.
- **Rejected file** — \`3px dashed\` error-500, background error-50. 32px error icon, headline
  "That's a .zip file", body "Unzip it first, then drag the folder that comes out. **Your file
  wasn't changed.**", the offending filename in 13px mono error-700, then secondary "Try again".
  The reassurance sentence is mandatory: a rejected drop is where an anxious user assumes they
  broke something.

### 2. Working screen — the multi-minute wait
Purpose: prove the tool is alive for minutes with no server to blame. Card, radius 10px,
padding 24px, elevation 1. **Five independent liveness signals** so no single stall reads as a crash:
1. 20px rotating in-progress arc — \`animation: spin 1.1s linear infinite\`.
2. Determinate 8px bar (neutral-200 track, primary-600 fill, radius 4px) with a translucent
   white sheen sweeping across it — \`2.4s ease-in-out infinite\`, so the bar moves even when the
   percentage does not.
3. **Filename ticker** — the real anti-frozen device. A 13px mono line in a neutral-50 inset
   panel labeled "NOW READING", re-rendered per file with a 140ms fade-up
   (\`opacity 0→1, translateY 2px→0\`), single-line with ellipsis.
4. Elapsed counter, ticking every second regardless of progress ("4 min 12 s elapsed").
5. Three running tallies (Fixed / Can't be fixed / No metadata) growing independently of the bar.

Also: heading 25px "Fixing your photos"; a right-aligned **coarse, honest** estimate — "about 3
minutes left", never "2:47", hidden until 30 files are done and only ever rounded down; the count
"412 of 1,204 files" at 16px/600 tabular; a notice banner "You can switch to another tab — this
keeps running. Closing the tab stops it, and no file will be half-written."; and a secondary
button labeled **"Stop — keep the 108 already fixed"**. "Cancel" alone implies losing them.

**Prohibited here:** an indeterminate barber-pole bar (it is the universal signal for "we don't
know", the one thing you cannot say to someone waiting on their photos), and a spinner alone.

Under reduced-motion the arc and the sheen stop; bar, counter, ticker and tallies still update,
so five signals degrade to three real ones.

### 3. Results screen — summary tiles over a collapsed table
Purpose: give the decision-level facts and let the user leave. **1,200+ rows is the wall of
detail this screen exists to avoid.** Success is a user who never opens the table.

Three tile treatments were compared in the visual spec (§9). **Option ii ships** (see
\`DECISIONS.md\`): three bordered tiles in a
\`repeat(3, 1fr)\` grid with 16px gap, each radius 10px, semantic-50 background, semantic-200
border, 20px 22px padding, containing: 13px uppercase semantic label + icon; the 39px tabular
count; a 16px plain-language line; then a 6px proportional bar (semantic-200 track, **brass-600
fill**) and a 13px "26% of your photos". Real content:
- success — 312 — "dates written back into the photo" — 26%
- notice — 891 — "HEIC files — left exactly as they are" — 74%
- warning — 44 — "no JSON file was found beside them" — 4%

**891 "can't be fixed" is notice slate, not warning amber.** The user did nothing wrong.

Below the tiles: the notice banner combining the timezone fact and the HEIC fact; then the
primary button "Download 312 fixed photos" with the download icon; then a chevron + link
"Show all 1,204 files". The disclosure sits **after** the notice, so "they're untouched" is read
before the user decides to investigate.

### 4. Results screen — expanded table (1440px)
Four columns: \`190px minmax(240px,1fr) 190px 190px\` — Status / File / Date found / Date written.
Header row neutral-100, 13px uppercase 650. Rows **44px min-height, no zebra striping** (the
status tints do that work; stripes plus tints is noise). Filenames 14px mono, single-line ellipsis.
Date columns right-aligned tabular. Above the table: the "Hide all 1,204 files" link and filter
chips (All / Fixed 312 / Can't be fixed 891 / No metadata 44), each chip carrying its icon.

Row variants:
- **normal** — white, success icon + "Fixed" in success-800.
- **warning** — warning-50 background, \`inset 3px 0 0\` warning-600, warning icon + "No metadata";
  empty values read "none found" / "left unchanged", never blank.
- **unmatched / error** — error-50 background, \`inset 4px 0 0\` error-600, error icon +
  "Couldn't match" at 650, filename in error-800 with a dotted underline, date cells "—".
  **A blank cell looks like a rendering failure to someone already worried; always print an em dash.**

Warning vs error rule: "no metadata" is amber because the user may want to act on it;
"couldn't match" is red because the tool failed, and saying so plainly is more reassuring than
hiding it.

### 5. 360px
- Tiles stack vertically, 12px gap, padding 14px 16px; the hero number drops **39px → 25px** and
  sits inline with its description (a 3-digit 39px number plus a label does not fit on one line,
  and a wrapped tile label is worse than a smaller number).
- **Below 720px the table stops being a table.** Each row becomes a stacked block: status word +
  icon on top (it is what gets scanned), then the filename in 14px mono with
  \`word-break: break-all\` — never truncated, because a truncated filename is useless to someone
  checking whether the right file was touched — then label/value pairs where the label travels
  with its value.
- **"Date found" is dropped at 360px** — derivable from "Date written" in the normal case,
  irrelevant in the failure cases. The one fact worth cutting.
- Filter chips scroll horizontally: the only permitted horizontal scroll, because a row of chips
  is self-evidently a row.
- **50 rows per page, not virtual scroll.** A paged list has an end; an infinite list of your own
  broken files does not.
- No horizontal scrolling of the table, ever, and no font size below 13px.

## Components — states

### Buttons
Base: \`padding: 12px 16px\`, 16px label, \`line-height: 1.25\`, \`gap: 8px\`, radius 6px, 1px border
one step darker than the fill, icon 16px **always with a text label, never icon-alone**. Total
height 44px — the touch-target floor hit exactly.

| | default | hover | focus-visible | disabled | loading |
|---|---|---|---|---|---|
| Primary | bg primary-600, border 700, #fff | bg 700, border 800 | + \`outline: 2px solid primary-400; outline-offset: 2px\` | bg neutral-200, border 200, text 400, \`cursor: not-allowed\` | bg 700, arc icon, "Preparing…" |
| Secondary | bg #fff, border neutral-300, text 800 | bg neutral-100, border 400, text 900 | same ring | bg neutral-50, border 200, text 400 | bg neutral-50, arc, "Reading…" |
| Destructive | bg error-600, border 700, #fff | bg 700, border 800 | same ring | bg neutral-200, text 400 | **none** |

- **One focus ring everywhere** — 2px primary-400 at 2px offset, on primary, secondary and
  destructive alike. \`:focus-visible\` only. Never \`outline: none\`.
- **Loading keeps the width.** Label swaps to a present participle, icon swaps to the rotating
  arc, padding and font unchanged so the button never resizes mid-action. Set \`aria-busy="true"\`
  and keep focus on the button.
- Destructive has **no loading state** (the action is instant and local; a spinner invites a
  second click) and **asks twice** — the only button in the system that does. A one-shot user who
  loses their results has no second chance.

### Text input
Label 13px/650 neutral-700, 6px below. Input: full width, \`padding: 11px 12px\`, 16px,
radius 6px, border neutral-300, background #fff. Hover border neutral-400. Focus: border
neutral-500 **plus** the standard ring. Disabled: bg neutral-50, border 200, text 400. Helper
text 13px neutral-500.

Error: border error-600 **plus** \`box-shadow: inset 0 0 0 1px error-600\` (2px effective weight
with no layout shift), \`aria-invalid="true"\`, and below it the error icon + message in
error-700 following the mandatory three-part shape: **what happened, then the reassurance, then
the fix** — e.g. "**Can't use "/"** — a slash isn't allowed in a filename. Try a hyphen."

### Link
primary-700, 1px underline at \`text-underline-offset: 2px\`, **always underlined** — color alone
is not a link signal. Hover: primary-800, underline 2px. Focus-visible: the standard ring.
Dark mode: primary-300. No external links in the product; if one is ever needed it carries the
words "opens a new tab" in text, not an icon.

### Card
Radius 10px, border neutral-200, background #fff, padding 24px (16px below 480px), elevation 1.
Optional 13px uppercase eyebrow with an icon, then a 20px title, then 16px body at a 60–66ch
measure.

### Notice banner (the fifth semantic — the most portable idea here)
notice-50 background, 1px notice-200 border, \`border-left: 3px solid notice-600\`, radius 6px,
\`padding: 12px 14px\`, \`gap: 9px\`. 16px notice icon, then a 13px/650 notice-800 label and 14px
neutral-700 body.

**Copy rules that travel with the color:**
- The label is always **"Good to know"** — never "Note", "Warning", or "Heads up".
- A notice **names the fact and then says what happens to the user's files.** "Can't be fixed"
  alone is frightening; "left exactly as they are" is the half that removes the fear.
- Real examples: "Dates are converted to your computer's current timezone." ·
  "891 HEIC files can't be fixed by this tool. They're left exactly as they are."

## Interactions & Behavior
Exactly **one** signature micro-interaction ships: **the tally tick** — during the wait, a changed
tally number fades up 3px into place over **120ms**, \`cubic-bezier(0.2,0,0,1)\`, throttled to at
most one tick per tile per **400ms**. Full detail and the rejected alternative are in
\`DECISIONS.md\`. Do not implement the download settle.

Both are wrapped opt-in, so the static version is the default and the animation is the enhancement:

\`\`\`css
@media (prefers-reduced-motion: no-preference) { /* transition declared here */ }
\`\`\`

The perpetual progress arc and bar sheen are separate — they are liveness, not signature — and
they also stop under \`prefers-reduced-motion: reduce\`.

No other animation anywhere. No bounce, no sound, no confetti, no emoji, no page transitions,
no hero animation, no scroll effects.

## State Management
\`\`\`
phase: 'idle' | 'dragover' | 'rejected' | 'working' | 'done'
rejected:   { reason, filename }
folder:     { name, fileCount }
progress:   { processed, total, startedAt, currentPath, etaSeconds|null }
tallies:    { fixed, cannotFix, noMetadata }
results:    Array<{ path, status: 'fixed'|'noMetadata'|'unmatched', dateFound, dateWritten }>
ui:         { tableExpanded: false, filter: 'all'|'fixed'|'cannotFix'|'noMetadata', page: 1 }
\`\`\`
- \`tableExpanded\` defaults **false**. That default is the design.
- ETA is \`null\` until 30 files are processed, then coarse and rounded down.
- Tally updates are batched/throttled to at most one visual tick per tile per 400ms.
- No fetch, no persistence, no localStorage, no service worker, no telemetry. State is in memory
  and dies with the tab — which is the promise, not a limitation.

## Files in this bundle
- \`Takeout Fixer Design System.dc.html\` — the one-page visual spec. Section \`2a\` is the full
  spec; \`1a\`/\`1b\` below it are the two directions that were compared, kept for provenance.
- \`CONTRAST-CHECK-SPEC.md\` — specification for \`contrast-check.html\`.
- \`DECISIONS.md\` — both decisions, closed, with the rejected options and their costs.
- \`CORE-AND-PROFILE.md\` — the portable core, the per-product profile template, and Takeout
  Fixer’s filled-in profile.

## Portable vs tuned
**Portable (reuse unchanged):** all eight ramps and both step-mapping tables · the type scale,
per-size letter-spacing, system-only font decision and tabular numerals · the 4px spacing scale,
6px/10px radii, two elevations, the pill ban · the single focus ring on every control type · the
three button geometries and their five states · the icon rules · never-hue-alone · **notice as a
fifth semantic** · the error-copy shape (what happened → what happened to your data → the fix).

Three rules were promoted from tuned to core, because they are conditions rather than taste:
**progress detail scales with duration** (1s / 10s / 60s thresholds), **confirm destructive actions
when and only when there is no undo**, and **every failure state names what happened to the
user’s data**.

**Tuned to anxious, one-shot users (re-decide per product):** summary-tiles-over-table (wrong
where the table *is* the product) · which rung of the progress ladder you land on · "Nothing is
uploaded" above the fold, and how often it is repeated · paged 50 rows instead of virtual scroll ·
the signature moment’s *placement* (the technique is portable, "during a multi-minute wait" is
not) · the brass accent itself, though its *role* — measurement, never status — is portable.

## Where this borrows from Apple, and where it diverges
State this in \`DESIGN.md\` too; the owner asked for it explicitly.

**Borrowed knowingly:** the cool gray neutral scale and negative tracking at display sizes ·
icon + text label on every action, never icon-alone (Photos) · summary-first with detail one click
behind, distraction stripped (News) · a 6px control radius · system fonts as a first-class
decision rather than a fallback.

**Diverged deliberately:** teal instead of system blue, so blue stays available for info and
notice · a fifth semantic Apple has no equivalent for · no translucency, vibrancy or blur
anywhere (they cost contrast you cannot verify, and GPU time on old machines) · stroked icons at
every size instead of filled-at-small-sizes pairs · brass as a measurement accent, which is not
an Apple move · and a progress state built on five redundant liveness signals where Apple would
show one confident bar. That last is the biggest divergence: Apple designs as though the machine
will not disappoint you. This tool runs on the user's hardware and sometimes will.
