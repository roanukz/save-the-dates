# Specification: \`contrast-check.html\`

A standalone page that computes every contrast ratio in the system **at runtime, in the browser**,
and reports PASS / FAIL / EXEMPT against WCAG 2.2 AA. The design spec deliberately contains no
contrast numbers — this page is the only source of them. The owner runs it and reports failures.

## Hard requirements
- **One file.** No build step, no npm, no imports, no CDN, no fonts, no network requests of any
  kind. Same promise as the product itself.
- Reads the token values from **one JS object literal at the top of the file** that mirrors
  \`tokens.css\` exactly. If \`tokens.css\` changes, this object changes; keep them adjacent in the
  repo and note the dependency in a comment.
- Prints its own copy of the pairing list, so a reader can see what was and was not checked.

## Maths (implement exactly this, do not approximate)
1. Parse hex → sRGB 0–1.
2. Linearise each channel: \`c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4\`.
3. Relative luminance \`L = 0.2126R + 0.7152G + 0.0722B\`.
4. Ratio \`(max(L1,L2)+0.05) / (min(L1,L2)+0.05)\`.
5. Round **down** to 2 decimals for display, but compare with the unrounded value. Never let a
   4.499 display as "4.50 PASS".

## Thresholds
| Kind | Threshold |
|---|---|
| Body text (< 24px, or < 18.66px bold) | 4.5:1 |
| Large text (>= 24px, or >= 18.66px at weight 700+) | 3:1 |
| UI component boundaries and focus indicators | 3:1 |
| Decorative (declared per pairing) | EXEMPT |
| Disabled controls | EXEMPT (WCAG exempts inactive components) |

Our sizes map as: 39 / 31 / 25 px = large text; 20 / 16 / 13 px = body text (20px at 600 is
below the 18.66px-bold cutoff only because 600 is not bold — treat 20px as body text and be
strict).

## Pairings to check

**Neutral text on neutral surfaces** — for each of \`#ffffff\`, neutral-50, neutral-100
backgrounds, test neutral-500 (13px), neutral-500 (16px), neutral-700 (16px), neutral-700 (13px),
neutral-900 (25px+), and primary-700 as link text at 16px.

**UI boundaries at 3:1** — neutral-200, neutral-300 and neutral-400 borders against \`#ffffff\`,
neutral-50 and each of the five semantic-50 tints. Also every semantic-200 border against its own
semantic-50 and against \`#ffffff\`.

**Focus ring at 3:1** — primary-400 against \`#ffffff\`, neutral-50, neutral-100, primary-600,
error-600, and all five semantic-50 tints. The ring must pass on every surface it can land on.

**Fills** — \`#ffffff\` text on primary-600, primary-700, primary-800, error-600, error-700,
success-600. Plus each fill against the page background at 3:1 (a solid button is a UI component).

**Semantic pairs, light** — for each of success / warning / error / info / notice: the 600 step
(notice: 700) as text at 13px, 14px and 16px on its own 50 tint and on \`#ffffff\`; the 800 step
at 16px and 25px on the 50 tint; the 600 step as a 3px left bar against the 50 tint at 3:1.

**Dark mode** — page 950 and surface 900 as backgrounds against: neutral-400 (13px and 16px),
neutral-200 (16px), neutral-50 (25px+), primary-300 (16px link). Borders neutral-800/700/600
against 950 and 900 at 3:1. Focus ring primary-300 against 950, 900, 800 and every semantic-900.
For each semantic: the 300 step (notice: 200) at 13/14/16px on its own 900 tint and on
neutral-900; the 700 step as a border against the 900 tint at 3:1; neutral-950 text on each
semantic-400 solid fill.

**Declared EXEMPT, reported but not failed**
- Disabled: neutral-400 on neutral-200 (light), neutral-600 on neutral-800 (dark).
- The brass tile bars: accent-600 on each semantic-200 track — decorative, because every number
  they encode is also written in text.
- neutral-200 dividers: separators, not UI boundaries.

## Output
- Two sections, **Light** and **Dark**, each grouped by ramp.
- One row per pairing: rendered swatch showing the actual text on the actual background at the
  actual size and weight, the token names, the size/weight, the computed ratio, the threshold,
  and PASS / FAIL / EXEMPT.
- A count at the top of each section: N pass, N fail, N exempt. **Sort failures to the top.**
- A copy-to-clipboard button producing a plain-text summary of failures only, so the owner can
  paste it straight back into a conversation. Format:
  \`FAIL  light  notice-700 on notice-50  14px/400  3.98 (needs 4.5)\`
- Render the page in the system's own type and colour — it is the first real test of the tokens.
- Include the marginal pairings the designer flagged "verify" in a highlighted group at the top:
  neutral-500 muted text on \`#ffffff\` at 13px · neutral-300 borders on neutral-50 and \`#ffffff\` ·
  warning-600 on warning-50 · the focus ring on every surface · notice-700 on notice-50 ·
  dark-mode neutral-400 on neutral-900 and every semantic-300 on semantic-900.

## What to do with failures
Do **not** silently adjust hexes. Report them. The fix is almost always "move one step darker/
lighter in the same ramp" and that changes the step-mapping table, which is a design decision the
owner makes — not a value you nudge until the checker turns green.
