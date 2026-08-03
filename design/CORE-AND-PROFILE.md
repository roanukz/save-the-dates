# Core and profile

The owner's preference is **portable**: the system installs as a **core** that never changes per
product, plus a short **profile** per product recording only its tuned decisions. A new utility
starts with the core and an empty profile, and every entry it adds has to be argued for.

## The core — install in every repo, unchanged
- \`tokens.css\` — all eight ramps, both step mappings, type scale with per-size letter-spacing,
  4px spacing scale, 6px/10px radii, two elevations.
- The type decision: system stack only, no external font request of any kind, mono for filenames.
- Tabular numerals, plus right-aligned fixed-\`ch\` numeric columns so alignment survives fonts
  that lack the feature.
- One focus ring — 2px primary-400 at 2px offset — on every control type, \`:focus-visible\` only.
- The three button geometries and their five states; input, link, card, notice banner.
- The eight inline SVG icons, and the closed-set rule.
- **Never hue alone**: every status carries hue + icon + word, and must survive greyscale.
- **Notice as a fifth semantic**, with its copy rules: the label is always "Good to know", and a
  notice names the fact and then says what happens to the user's files.
- Error copy shape: what happened → what happened to your data → the fix.
- **Progress detail scales with duration** — under 1s nothing; under 10s a bar; over 10s add a
  per-item ticker; over 60s all five liveness signals. Never an indeterminate barber-pole, and
  never a spinner alone.
- **Confirm destructive actions when there is no undo**, and only then.
- \`prefers-color-scheme\` only — no toggle, no stored preference.
- No third-party runtime request of any kind: no CDN, no webfont, no icon font, no analytics.

## The profile — one short file per product

\`\`\`markdown
# Profile: <product>

Audience and stakes:            <one sentence>
Primary surface:                <what the first screen must accomplish>
Progress rung:                  none | bar | bar+ticker | full five-signal
Destructive confirms:           yes | no   (why)
Privacy claim placement:        <where, and how often it's repeated>
Detail disclosure:              <collapsed-by-default? paged or virtual? row cap?>
Signature moment:               <where it sits, and why that's the highest-value point>
Accent role:                    <measurement / signature / unused>
Deviations from core:           <each one, with the argument>
\`\`\`

## Profile: Takeout Fixer
\`\`\`
Audience and stakes:   Non-technical people migrating irreplaceable photos. One visit, no account,
                       no second chance.
Primary surface:       Summary tiles carrying the decision-level facts; the 1,204-row table is a
                       drill-down, collapsed by default. Success is a user who never opens it.
Progress rung:         Full five-signal — this runs for minutes.
Destructive confirms:  Yes. Results are irreplaceable and there is no undo.
Privacy claim:         "Nothing is uploaded" above the fold on the first screen, and restated in
                       the working state ("no file will be half-written").
Detail disclosure:     Collapsed by default; paged 50 rows, never virtual scroll — a paged list
                       has an end, an infinite list of your own broken files does not.
                       Below 720px the table becomes stacked blocks, and "Date found" is dropped.
Signature moment:      The tally tick, during the multi-minute wait. The wait is where trust is
                       lost, so that's where the one moment goes.
Accent role:           Brass as measurement only — the proportional bars in the tiles. Never
                       status, never interaction.
Deviations from core:  None. Every tuned choice above is an instance of a core rule, not an
                       exception to one.
\`\`\`

## What stays in the profile forever
Tiles-over-table, "nothing is uploaded" above the fold, paged-not-infinite rows, and where the
signature moment sits. These are genuinely about *this* audience — a tool where the table **is**
the product should invert the first one without hesitation.
