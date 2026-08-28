# Save the Dates

Your Google Photos export using their official tool Takeout lands with every file stamped today. This tool puts the real dates back.

A single-page browser tool that gives every file in a Google Photos Takeout export its
real capture date, and fills in the EXIF of the JPEGs that are genuinely missing one.
Hand it the .zip files exactly as Google sent them; nothing needs unpacking first.

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

Measured on a real 65-file export spanning 2013 to 2024: 35 of 45 JPEGs still had their
`DateTimeOriginal` embedded, and all 7 files named `.HEIC` came out with date *and* GPS
intact. Google copies metadata into the `.json` sidecars; it does not move it out of the
files.

The sidecar is genuinely the only copy for two things: photos that never had EXIF at all
(screenshots, images shared in from messaging apps, scans), and any date or location you
edited inside Google Photos, which is never written back into the file.

So this tool puts the right date on every file in your download, whether JPEG, HEIC, RAW
or video, and only writes inside the JPEGs that are actually missing something.

One thing it deliberately will not do: when a photo has no date of its own, Google's
sidecar still offers one, and that value is usually the moment the photo entered the
library rather than when it was taken. In the measured export, 10 such photos carried
timestamps spanning 16 seconds in total. The tool labels where every date came from,
flags that upload-batch pattern, and leaves those dates out of the file unless you ask
for them.

## Running it

Open [the hosted version](https://roanukz.github.io/save-the-dates/tool.html), or download
this repository and open `tool.html` in a browser. That is the whole install.

There is no server, no build step and no package manager. The three libraries in
`vendor/` are committed to this repository and loaded from disk, so the page works with
the network off, which is also the easiest way to verify the privacy claim.

Reading zips added no fourth library. It uses `DecompressionStream`, which is built into
the browser, so the floor is a browser from 2023 or later. Anything older is told plainly
and can still use the folder route.

## What it does

- **Reads the .zip files Google sent, without unpacking them.** Drop the whole set in at
  once, including a numbered export split across parts, and photos are matched to the
  sidecars holding their dates even when the two arrived in different zips. Nothing is
  extracted to disk, so repairing a library no longer needs room for a second copy of it.
  If there is a gap in the numbers, it says which part is missing before it starts,
  because a missing part produces a result that looks complete and is not. It cannot know
  how many parts Google made, so a set truncated at the end is the one case it cannot
  catch, and it says so rather than implying otherwise. A folder still works
  exactly as before.
- **Stamps every file in the output with its real capture date**, so the library lands
  correctly the moment you unzip it. In order of trust: the file's own
  `DateTimeOriginal`, then its Live Photo partner's, then the sidecar, then the file's
  original modified date. Never "now".
- Reads existing metadata from JPEG, HEIC, RAW and PNG before writing anything, and
  reports per file whether it needed the tool at all. Formats are identified by their
  bytes, never by their filename.
- Matches each photo to its sidecar. Google's naming is inconsistent: it truncates long
  names at 46 characters, moves duplicate counters around, and ships two different sidecar
  formats in the same export. All of that guesswork lives in one function,
  `findSidecarFor()`.
- Writes `DateTimeOriginal`, `DateTimeDigitized`, `DateTime` and GPS coordinates into the
  JPEGs that are genuinely missing them, and leaves the rest alone.
- **Labels where every date came from**, and detects upload batches: several date-less
  photos sharing a sidecar timestamp within seconds is one upload, not several capture
  times. Those dates stay out of the file unless you ask for them.
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

Only JPEGs are written to. HEIC, RAW and video are copied through untouched and correctly
dated, so you do not have to sort a mixed folder before using this. Measurement is the
reason: those formats came out of Takeout with their metadata already intact, so there is
nothing in them to repair. Nothing is ever written to your originals; you get a new copy
as a download.

## Constraints

These are deliberate and are not up for quiet erosion:

- 100% client-side. No server, no backend, no uploads, no network calls at runtime.
- No build step, no bundler, no framework, no `npm install`.
- Any third-party library must be a single file, vendored into `vendor/`.
- No accounts, no database, no analytics, no telemetry.

## Layout

| Path | What it is |
|---|---|
| `index.html` | The product teardown, the site's front door, styled from `tokens.css` unchanged |
| `tool.html` | The entire UI |
| `app.js` | All logic: matching, sidecar parsing, timezone resolution, EXIF writing, reports |
| `zip.js` | Reads a Takeout .zip without unpacking it: the index, then one entry at a time |
| `style.css` | Components |
| `tokens.css` | The design system's raw values; portable, nothing app-specific |
| `DESIGN.md`, `design/` | The reasoning behind the design system |
| `contrast-check.html` | Recomputes every contrast ratio in the system, in the browser |
| `teardown.html` | Redirect to `/`, because the teardown's old URL is printed on a CV already in circulation |
| `og-image.svg` | Source for the social share card, edit this one |
| `og-image.png` | The rendered share card, committed so nothing has to build |
| `test-fixtures/` | Sidecar-naming cases, and the zip-reading tests |

The share card is committed as a PNG so serving the site still needs no build
step. It is rendered at **2400 by 1254**, twice the 1200 by 627 Open Graph size,
because a 1× asset is scaled up on high-DPI screens and visibly softens. The
`og:image:width` / `og:image:height` tags must match whatever is committed.

To regenerate it after editing the SVG, render at 4× and downsample. LibreOffice's
own rasterizer is adequate, but supersampling gives noticeably cleaner edges:

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

Two test pages run the real code in your browser and need no install:

| Page | What it checks |
|---|---|
| `test-fixtures/naming-tests.html` | `findSidecarFor()` against Google's awkward naming |
| `test-fixtures/zip-tests.html` | `readZip()` against archives it builds while you watch |

The zip tests build their own archives rather than committing any, for the same privacy
reason. They check that a file read out of a zip is byte for byte the file you would get
by unpacking it by hand, whichever way it was stored, and that a damaged or incomplete
archive is refused rather than quietly returning less. That last group matters most: a
zip that half-reads produces a result that looks perfectly healthy, which is the one
failure this tool exists to prevent.

## License

MIT, see [LICENSE](LICENSE).

The three libraries in `vendor/` are third-party and keep their own licenses:

| File | Source | License |
|---|---|---|
| `piexif.js` | `piexifjs@1.0.6` | MIT |
| `jszip.min.js` | `jszip@3.10.1` | MIT or GPLv3 |
| `tz-lookup.js` | `tz-lookup@6.1.25` | see upstream, the minified copy carries no header |

## Trademarks

Not affiliated with, endorsed by, or sponsored by Google. Google Photos™ and Google
Takeout™ are trademarks of Google LLC.
