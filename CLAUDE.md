# Takeout Fixer

## What this is
A single-page browser tool that repairs Google Photos Takeout exports by reading the
JSON sidecar files and writing the original capture date and GPS back into the JPEG EXIF.

## Hard constraints - do not violate without asking me first
- Runs 100% client-side in the browser. No server, no backend, no uploads, no network calls.
- No build step, no bundler, no npm install, no framework. Plain HTML, CSS, and JavaScript.
- Any third-party library must be a single file loaded via <script> tag from a CDN or vendored locally.
- No accounts, no database, no analytics, no telemetry.
- Target files: JPEG only for v1.

## Files
- index.html - the entire UI
- app.js - all logic
- style.css - styling

## Rules for you
- Ask before adding any dependency.
- Do not refactor code I did not ask you to change.
- Keep functions short and commented in plain English.
- After each change, tell me exactly what to do to test it.
