# Takeout Fixer

## What this is
A single-page browser tool that repairs Google Photos Takeout exports. It puts the real
capture date back on EVERY file in the output zip - JPEG, HEIC, RAW and video - because
unzipping resets every file's modified date and that is the symptom people actually see.
It writes inside only the JPEGs that are genuinely missing a date or a location.

## What is NOT true, measured on a real export
Google does NOT strip EXIF. In a 65-file export (~/Downloads/Takeout 2), 35 of 45 JPEGs
still had DateTimeOriginal, and all 7 files named .HEIC had date AND GPS intact - though
only 3 of those were genuinely HEIC-encoded; Google had converted the other 4 to JPEG
while keeping the .HEIC extension. The sidecar is only the sole copy for photos that
never had EXIF, and for edits made inside Google Photos.

- HEIC/RAW/video processing is CANCELLED, not deferred. They came out intact. Do not add
  it, and do not add a WASM ExifTool.
- A date that exists only in Google's sidecar is when the photo ENTERED the library, not
  when it was taken. In the test export, 10 such photos shared a 16-second window. Never
  write those into DateTimeOriginal without the user explicitly asking.

## Reading zips, added in v2
The tool takes the .zip files as Google sent them. zip.js reads the index at the end of
the archive and then one entry at a time via Blob.slice, inflating with the browser's own
DecompressionStream. No new dependency. JSZip is NOT usable for reading: its readInt is a
32-bit signed shift, so it returns a negative offset for any archive over 2 GB and cannot
find the index at all. It stays where it is, writing the output.

MEASURED, two real exports, August 2026: Google deflates every entry, photos included,
at 100.0% of original size. Do not reintroduce the assumption that photos are stored
verbatim; the stored path is kept because other archivers use it, not because Google does.

A partially read zip is the worst failure this tool can have, because it looks healthy.
readIndex checks the entry count, readRange verifies CRC-32 on every whole file, and a
gap in a numbered set is reported before the scan starts. Do not remove those.

DO NOT ADD A CACHE to zip.js. One existed and was removed. It kept any entry under 4 MB,
which is most photos, so memory grew with the library instead of staying flat. It also
stored the bytes BEFORE the checksum ran and returned early on a hit, so a damaged entry
could fail once and then be served as good forever after. Nothing is read in full twice in
one run, so it bought nothing. test-fixtures/zip-tests.html has a regression test.

findMissingParts only sees gaps in the sequence. It CANNOT detect a set missing its last
part, because nothing in the filenames says how many there should be. Do not write copy
that claims otherwise.

## Hard constraints - do not violate without asking me first
- Runs 100% client-side in the browser. No server, no backend, no uploads, no network calls.
- No build step, no bundler, no npm install, no framework. Plain HTML, CSS, and JavaScript.
- Any third-party library must be a single file loaded via <script> tag from a CDN or vendored locally.
- No accounts, no database, no analytics, no telemetry.
- Only JPEGs are ever written to. Everything else is copied through byte for byte.
- Metadata READING is format-sniffed from the bytes, never from the file extension:
  a real export had seven ".HEIC" files that were plain JPEGs inside. This applies to
  deciding whether a dropped file is a ZIP too: looksLikeZip() reads the PK signature,
  it does not look at the name.

## Files
- tool.html - the entire UI of the tool
- index.html - the product teardown, served at the site root
- app.js - all logic
- zip.js - reads a Takeout .zip in place, without unpacking it
- style.css - components, tokens.css - the design tokens
- vendor/ - piexif, jszip, tz-lookup, all loaded from disk

## Rules for you
- Ask before adding any dependency.
- Do not refactor code I did not ask you to change.
- Keep functions short and commented in plain English.
- After each change, tell me exactly what to do to test it.
