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

## Hard constraints - do not violate without asking me first
- Runs 100% client-side in the browser. No server, no backend, no uploads, no network calls.
- No build step, no bundler, no npm install, no framework. Plain HTML, CSS, and JavaScript.
- Any third-party library must be a single file loaded via <script> tag from a CDN or vendored locally.
- No accounts, no database, no analytics, no telemetry.
- Only JPEGs are ever written to. Everything else is copied through byte for byte.
- Metadata READING is format-sniffed from the bytes, never from the file extension:
  a real export had seven ".HEIC" files that were plain JPEGs inside.

## Files
- tool.html - the entire UI of the tool
- index.html - the product teardown, served at the site root
- app.js - all logic
- style.css - components, tokens.css - the design tokens
- vendor/ - piexif, jszip, tz-lookup, all loaded from disk

## Rules for you
- Ask before adding any dependency.
- Do not refactor code I did not ask you to change.
- Keep functions short and commented in plain English.
- After each change, tell me exactly what to do to test it.
