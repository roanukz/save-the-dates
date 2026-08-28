# Decisions — both closed

Owner's call, 2026-08-03. Implement these; **delete the alternatives** rather than shipping a
config flag. The rejected options and their costs are recorded here so nobody reopens them by
accident six months from now.

## 1. Summary tile treatment — **option ii ships**
Three bordered tiles, \`repeat(3, 1fr)\` with 16px gap, each radius 10px, semantic-50 background,
semantic-200 border, 20px 22px padding. Inside each: 13px uppercase semantic label + 16px icon;
the 39px tabular count; a 16px plain-language line; a 6px proportional bar (semantic-200 track,
**brass-600 fill**); a 13px "26% of your photos". Content: success 312 / notice 891 / warning 44.

Below the tiles, in this order: the notice banner (timezone fact + HEIC fact) → primary button
"Download 312 fixed photos" → chevron link "Show all 1,204 files". **The order matters** — the
user reads "they're untouched" before deciding whether to investigate.

At 360px the tiles stack with 12px gap, padding 14px 16px, and the count drops 39px → 25px inline
with its description.

Rejected:
- **Option i (numbers on the page, rule-separated)** — quietest and largest numbers, but no sense
  of proportion: 312 and 891 look equally weighted, and "most of your files couldn't be fixed" is
  something the user needs to feel, not read.
- **Option iii (one segmented bar + legend)** — proportion is unmissable and it's the most
  compact, but the 44-file segment is 4% wide, so its number can't fit and one of three facts gets
  demoted to the legend. It also reads as data visualization, which invites analysis where these
  users want a verdict. Breaks at 360px, where 4% is 12px.

## 2. Signature micro-interaction — **the tally tick ships**
During the multi-minute wait, on the three running tallies. When a number changes, the new number
fades up 3px into place over **120ms**, \`cubic-bezier(0.2,0,0,1)\`. The old number is replaced, not
animated out. Tabular numerals keep the digits from shifting, so it reads as a value landing
rather than text reflowing.

**Mandatory throttle:** at most one visual tick per tile per **400ms**, with counts batched in
between. Without it, fast machines flicker.

\`\`\`css
@media (prefers-reduced-motion: no-preference) {
  .tally-value { animation: tally-tick 120ms cubic-bezier(0.2,0,0,1); }
}
@keyframes tally-tick { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
\`\`\`
Declared opt-in, so the static version is the default and the animation is the enhancement.
Reduced-motion: numbers change with no transition — nothing is lost, since the counts were always
the information.

Rejected: **the download settle** (button icon + label crossfading to a success check and "Saved
to your Downloads folder" over 160ms). Genuinely one moment and it answers the most common
post-download question, but it lands after the anxiety has already resolved, and it would make a
control change semantic color — the one place in the system that would happen.

**This is the only animation in the product**, other than the progress arc and bar sheen, which
are liveness rather than signature and also stop under \`prefers-reduced-motion: reduce\`.
No bounce, no sound, no confetti, no emoji, no page transitions, no scroll effects.
