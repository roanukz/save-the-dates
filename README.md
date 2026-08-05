# Save the Dates

Google Photos gave your memories back. It kept the *when* and the *where*.

A single-page browser tool that repairs Google Photos Takeout exports by reading the
JSON sidecar files and writing the original capture date and GPS position back into
the JPEG's EXIF.

**[Read the product teardown →](https://roanukz.github.io/save-the-dates/)**  ·  **[Try it live →](https://roanukz.github.io/save-the-dates/tool.html)**

The teardown is the site's front door, because the link that gets shared is being
read by people evaluating the thinking, not by people with a broken export to fix.
It covers the problem, the evidence that it is real and recurring, the decisions I
committed to and what each one cost, and what I would cut. The tool itself is one
click away from the top of it.

## The problem

Every photo file has a hidden EXIF section storing when the picture was taken and where
you were standing, and separately the file itself has a "date modified" that the operating
system keeps. Those are different fields, and only one of them is actually broken.

Unzipping a Takeout export stamps every extracted file with the moment it was extracted.
That is what you see in Finder and Explorer, it is what a lot of import tools sort by, and
twenty years of birthdays collapse into a single day. The EXIF inside most of those photos
is untouched.

Measured on a real 65-file export spanning 2013–2024: 35 of 45 JPEGs still had their
`DateTimeOriginal` embedded, and all 7 HEIC files came out with date *and* GPS intact.
Google copies metadata into the `.json` sidecars; it does not move it out of the files.

The sidecar is genuinely the only copy for two things: photos that never had EXIF at all
(screenshots, images shared in from messaging apps, scans), and any date or location you
edited inside Google Photos, which is never written back into the file.

So this tool puts the right date on every file in your download — JPEG, HEIC, RAW and video
alike — and only writes inside the JPEGs that are actually missing something.

> **Correction, 5 August 2026.** This README previously said Takeout "pulls the date and
> location out" of your photos and that apps "get no answer" from the file. That was wrong.
> Measuring my own export is what corrected it. The tool now reads each file's existing
> metadata before writing anything, and reports per file whether it needed the tool at all.
> See the [teardown](https://roanukz.github.io/save-the-dates/) for the full correction.

## Running it

Open [the hosted version](https://roanukz.github.io/save-the-dates/tool.html), or download
this repository and open `tool.html` in a browser. That is the whole install.

There is no server, no build step and no package manager. The three libraries in
`vendor/` are committed to this repository and loaded from disk, so the page works with
the network off — which is also the easiest way to verify the privacy claim.

## What it does

- Matches each photo to its sidecar. Google's naming is inconsistent: it truncates long
  names at 46 characters, moves duplicate counters around, and ships two different sidecar
  formats in the same export. All of that guesswork lives in one function,
  `findSidecarFor()`.
- Writes `DateTimeOriginal`, `DateTimeDigitized`, `DateTime` and GPS coordinates.
- **Derives the timezone from the photo's GPS position**, not from the machine running the
  tool. A photo taken at 3pm in London reads 3pm whether you run this at home or abroad.
  Daylight saving is resolved for the actual date via `Intl`. Photos with no GPS fall back
  to UTC, written exactly as Google stored it.
- Also writes the `OffsetTime*` EXIF tags, so apps that understand them can recover the
  true instant rather than guessing.
- Splits large libraries into batched zips, because holding a whole library in browser
  memory crashes the tab.
- Produces two CSV reports: a **preview** of what *will* be written, and a **results**
  report of what *was*. They are deliberately hard to confuse, since one describes photos
  nothing has happened to yet.

## Scope

JPEG only. HEIC, PNG and video are counted, listed and left strictly alone — you do not
have to sort a mixed folder before using this. Nothing is ever written to your originals;
you get a new copy as a download.

## Constraints

These are deliberate and are not up for quiet erosion:

- 100% client-side. No server, no backend, no uploads, no network calls at runtime.
- No build step, no bundler, no framework, no `npm install`.
- Any third-party library must be a single file, vendored into `vendor/`.
- No accounts, no database, no analytics, no telemetry.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The product teardown — the site's front door, styled from `tokens.css` unchanged |
| `tool.html` | The entire UI |
| `app.js` | All logic — matching, sidecar parsing, timezone resolution, EXIF writing, reports |
| `style.css` | Components |
| `tokens.css` | The design system's raw values; portable, nothing app-specific |
| `DESIGN.md`, `design/` | The reasoning behind the design system |
| `contrast-check.html` | Recomputes every contrast ratio in the system, in the browser |
| `teardown.html` | Redirect to `/` — the teardown's old URL is printed on a CV already in circulation |
| `og-image.svg` | Source for the social share card — edit this one |
| `og-image.png` | The rendered share card, committed so nothing has to build |
| `test-fixtures/` | Sidecar-naming cases |

The share card is committed as a PNG so serving the site still needs no build
step. It is rendered at **2400×1254** — twice the 1200×627 Open Graph size —
because a 1× asset is scaled up on high-DPI screens and visibly softens. The
`og:image:width` / `og:image:height` tags must match whatever is committed.

To regenerate it after editing the SVG, render at 4× and downsample. LibreOffice's
own rasteriser is adequate, but supersampling gives noticeably cleaner edges:

```
soffice --headless \
  --convert-to 'png:draw_png_Export:{"PixelWidth":{"type":"long","value":4800},"PixelHeight":{"type":"long","value":2508}}' \
  og-image.svg
sips -z 1254 2400 og-image.png --out og-image.png
```

## Testing

No sample Takeout data is committed, and `.gitignore` is set up to keep it that way. The
sidecar `.json` files carry the GPS coordinates of wherever the photos were taken, so a
test export is personal data. Point the tool at a folder outside this repository.

## Licence

MIT — see [LICENSE](LICENSE).

The three libraries in `vendor/` are third-party and keep their own licences:

| File | Source | Licence |
|---|---|---|
| `piexif.js` | `piexifjs@1.0.6` | MIT |
| `jszip.min.js` | `jszip@3.10.1` | MIT or GPLv3 |
| `tz-lookup.js` | `tz-lookup@6.1.25` | see upstream — the minified copy carries no header |

## Trademarks

Not affiliated with, endorsed by, or sponsored by Google. Google Photos™ and Google
Takeout™ are trademarks of Google LLC.
