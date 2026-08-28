# Release notes

Newest first. The reasoning behind each decision lives in the
[product teardown](https://roanukz.github.io/save-the-dates/); this file is the short
record of what changed and what it cost.

---

## v2, 2026-08-18. It takes the zips

Google sends .zip files. Until now this tool made you unpack them first. It does not any
more: hand it the files exactly as they arrived, all of them at once, and it reads inside
them without unpacking anything.

### What changed for you

- **Drop the zips in as they are.** Nothing to extract, and no need for room on your disk
  for a second copy of your library. On a large export that is the bigger win: one user on
  Google's own forum describes a month spent downloading and extracting a 36,000 image
  library, and disks filling up in the process.
- **Hand over the whole numbered set at once.** Google splits one library across parts
  wherever the size limit falls, so a photo can be in one part while the .json holding its
  date is in another. The parts are now matched up in memory. This is what the old
  instruction to "unzip them all into the same folder" existed to do by hand.
- **If there is a gap in the part numbers, you are told before anything is read**, not
  after an hour of work. It names the number, and it asks rather than refuses, because two
  overlapping exports or renamed files can look like a gap without being one. It works by
  spotting a hole in the sequence, so it cannot tell that the *last* part is missing:
  nothing in the filenames says how many there were meant to be. Check the highest number
  against Google's email.
- **The loose files Google ships beside the zips are accepted.** When a single video is
  larger than the split size you picked, Google cannot fit it in a part and sends it on its
  own. Select everything Google gave you and it all gets read.
- **A folder still works exactly as before.** Nothing about the old route changed.

### Two things this release got wrong, and corrected

Both were claims about how Google packs an archive, written down as reasoning before being
checked. Both were then measured against two real Takeout exports and both were wrong.

| The assumption | What two real exports show |
|---|---|
| Photos are stored verbatim, because a JPEG is already compressed and there is nothing to gain by compressing it again | Every entry is compressed, photos included, and they come out at 100.0% of their original size. The compression achieves nothing and Google does it anyway. |
| Reading the zip directly recovers a real last-resort date, where unpacking by hand replaces it with the moment of extraction | It is the moment Google packed the archive. 121 entries carry 5 distinct timestamps spanning 62 seconds. Photos taken across years do not do that. |

The design survived both, because it never depended on either. The first cost a
performance argument that would otherwise have been published as fact. The second changed
behavior: a packing timestamp is now treated as no date at all, it is never written inside
a file, and the results screen says so in words.

### What it now refuses to do

Reading an archive introduces a failure this tool did not have before, and it is the worst
shape available to it: a zip that half-reads produces a scan that looks completely healthy
while describing part of a library. So it refuses rather than continues when

- the archive holds fewer files than it declares, which is what a damaged or truncated
  download looks like from the inside,
- any file fails the checksum stored beside it in the zip, so a damaged photo is never
  copied into the output and presented as repaired,
- an archive claims to be a large one and has no large-format index to read.

Refusing is recoverable, because Google will send the file again. Deleting your originals
against a silently partial copy is not.

A review pass before this shipped found that guarantee had a hole in it. Entries under
4 MB were kept in memory after their first read, the copy was stored before the checksum
ran, and a later read returned that copy unchecked, so a damaged file could fail once and
then be served as good. The same cache also retained most of a library rather than the
handful of small files it was meant for. It is gone, it bought nothing because nothing is
read in full twice in one run, and the test page now fails if it comes back.

### Under the hood

- New `zip.js`, about 360 lines of first-party code and 250 of comments. It reads the index at the end of the
  archive, then fetches one entry at a time with `Blob.slice`, inflating with the browser's
  own `DecompressionStream`. **No new dependency.** Memory does not grow with the size of
  the archive.
- JSZip stays where it was, writing the output. It cannot read these archives: its shipped
  integer reader uses a 32-bit signed shift, so on a 2.6 GB test archive the real index
  offset of 2,621,440,000 comes back as minus 1,673,527,296. That is every archive over
  2 GB, not just the very large ones.
- Whether a dropped file is an archive is decided by reading its first bytes, never by its
  name, which is the same rule the rest of the tool already followed for photos.

### What this costs

- **A browser from 2023 or later**, because inflating uses `DecompressionStream`, which
  landed in Safari 16.4 and Firefox 113. Anything older is told plainly and can still
  unpack the export itself and use the folder route.
- **Six hundred-odd lines of format parsing and explanation** now live in a project whose
  pitch is that it is small.
- **A checksum pass** over every file that gets written out.

### What is not proven

- The two exports measured are one library, three days apart. That is enough to refute two
  claims, because one counterexample refutes, and nowhere near enough to describe what
  Google does in general.
- Both are 2 GB splits, so neither contains a large-format index. The 10 GB and 50 GB
  splits are covered only by archives built to look like them.
- There are still no users. This release is evidence that the thing the roadmap named is
  built and that its claims can be checked. It is not evidence that anyone wanted it.

### Also in this release

The teardown's positioning claim was retracted. It said the position was empty: a free,
client-side, browser-based repairer. That is no longer true, and part 7 now records what
replaced the claim and what still separates the two tools, checked in the other tool's own
shipped code rather than taken from its marketing.

### Checking it yourself

`test-fixtures/zip-tests.html` opens in a browser with no install and runs 109 checks
against archives it builds while you watch, including a deliberately damaged one, an
archive that lies about how many files it holds, and an export split across parts. No
sample library is committed to this repository, because a real export is personal data.

---

## v1, 2026-08-03 to 2026-08-10. The first version

A single page that gives every file in a Takeout export its real capture date and fills in
the EXIF of the JPEGs genuinely missing one. Timezones derived from the photo's GPS
position rather than from the machine running the tool. Dates labeled with where they came
from, and Google's upload timestamps kept out of your photos unless you ask for them.
Client-side, no install, no account, no telemetry. Input was a folder you unpacked yourself.
