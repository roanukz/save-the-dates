// Takeout Fixer - version 1
//
// What this file does, in plain English:
//   1. Waits for you to pick your unzipped Google Takeout folder.
//   2. Splits everything it finds into photos (.jpg/.jpeg) and sidecars (.json).
//   3. Works out which sidecar belongs to which photo. Google's naming is messy,
//      so all of that guesswork lives in ONE function: findSidecarFor().
//   4. Reads the date and GPS out of each matched sidecar.
//   5. Works out the timezone of the place each photo was taken, from its GPS position,
//      and converts Google's UTC time into the wall clock time of that place.
//   6. Draws a table showing what it found.
//
// It does NOT touch your files and does NOT talk to the internet.


// ---------------------------------------------------------------------------
// PART 1 - THE SIDECAR MATCHING RULES
//
// This is the part that will need changing when Google changes its format again.
// Everything else in this file can be left alone.
// ---------------------------------------------------------------------------

// The middle bit Google sticks into current sidecar names.
// If they rename it one day, change this single line.
const SUPPLEMENTAL_TAG = 'supplemental-metadata';

// Google clips a long sidecar name down to this many characters. The ".json" on the
// end is added AFTER the clipping and is never cut, so a clipped sidecar name always
// ends up 46 + 5 = 51 characters long in total.
const MAX_NAME_LENGTH = 46;


/**
 * Given one photo filename and a list of sidecar filenames that live in the SAME
 * folder, work out which sidecar belongs to the photo.
 *
 * Returns the matching sidecar filename, or null if there isn't one.
 *
 * HOW THIS WORKS, AND WHY IT WORKS THIS WAY
 * We start from the PHOTO's name, work out the exact names its sidecar is allowed
 * to have, and then check whether any of those names really exists in the folder.
 * We never work backwards from a sidecar name to a photo name, and we never accept
 * a "close enough" name, because a wrong match writes a wrong date into a photo,
 * which is worse than writing nothing at all.
 *
 * The two name formats, both of which turn up in the SAME export:
 *   IMG_1234.jpg.supplemental-metadata.json   the current format
 *   IMG_1234.jpg.json                         the older format
 *
 * CLIPPING. Google cuts the name down to 46 characters and only then adds ".json",
 * so the ".json" is never lost. Only the ".supplemental-metadata" part gets eaten:
 *   photo name up to 24 characters -> nothing is clipped at all
 *   photo name of exactly 45       -> everything is eaten except the leading dot of
 *                                     ".supplemental-metadata", which leaves a
 *                                     DOUBLE DOT, e.g. some_long_photo.jpg..json
 *   photo name longer than 46      -> ".supplemental-metadata" disappears entirely
 *                                     AND the photo name itself is cut short
 *
 * DUPLICATE COUNTERS such as "(1)" are never clipped, and in the current format the
 * counter sits at the END of the clipped part, not next to the photo's extension:
 *   IMG_1234(1).jpg -> IMG_1234.jpg.supplemental-metadata(1).json   current format
 *                   -> IMG_1234.jpg(1).json                         older format
 *
 * "-EDITED" photos have no sidecar of their own, so "IMG_1234-edited.jpg" borrows
 * the one belonging to "IMG_1234.jpg".
 */
function findSidecarFor(imageFilename, sidecarFilenameList) {

  // --- Step 1: list what is actually in the folder -------------------------
  // A lookup table of every sidecar name, so we can ask "does this exact name
  // exist?" Upper and lower case count as the same, because some computers change
  // it. Nothing else about a name is allowed to differ.
  const sidecarLookup = new Map();
  for (const name of sidecarFilenameList) {
    const key = name.toLowerCase();
    if (!sidecarLookup.has(key)) sidecarLookup.set(key, name);
  }

  // --- Step 2: work out the names a photo's sidecar could have --------------
  // Best first. Every one of these is an exact name, not a pattern.
  function candidateNamesFor(mediaName) {
    // Separate a duplicate counter such as "(1)" from the rest of the name.
    // "IMG_1234(1).jpg" becomes the plain name "IMG_1234.jpg" plus counter "(1)".
    const dot = mediaName.lastIndexOf('.');
    const stem = dot === -1 ? mediaName : mediaName.slice(0, dot);
    const extension = dot === -1 ? '' : mediaName.slice(dot);

    let plainName = mediaName;
    let counter = '';
    const counterMatch = stem.match(/^(.*)\((\d+)\)$/);
    if (counterMatch) {
      plainName = counterMatch[1] + extension;
      counter = '(' + counterMatch[2] + ')';
    }

    // The full current-format name, before any clipping.
    const longName = plainName + '.' + SUPPLEMENTAL_TAG;

    const names = [];

    // 1. Current format. Clip to 46 characters, THEN add the counter and ".json".
    //    That single piece of clipping produces all three shapes described above:
    //    the untouched name, the double-dot 45-character case, and the case where
    //    the photo name itself gets cut short.
    names.push(longName.slice(0, MAX_NAME_LENGTH) + counter + '.json');

    // 2. Older format: the photo name with ".json" stuck on the end.
    names.push(plainName + counter + '.json');

    // 3. Older format where the photo name on its own is over the 46 limit.
    names.push(plainName.slice(0, MAX_NAME_LENGTH) + counter + '.json');

    // 4. Safety net: the current format with nothing clipped, in case the export
    //    came from a version of Takeout that did not clip long names.
    names.push(longName + counter + '.json');

    // 5. Safety net: some exports look as though the counter is counted as part of
    //    the 46 characters instead of being added afterwards. Tried last because it
    //    is the least certain of these rules.
    if (counter) {
      names.push(longName.slice(0, MAX_NAME_LENGTH - counter.length) + counter + '.json');
    }

    return names;
  }

  // Try every candidate name for one photo name and return the first one that
  // really exists, or null if none of them do.
  function lookUpSidecarFor(mediaName) {
    for (const candidate of candidateNamesFor(mediaName)) {
      const realName = sidecarLookup.get(candidate.toLowerCase());
      if (realName) return realName;
    }
    return null;
  }

  // --- Step 3: try the photo's own name, then the "-edited" fallback --------
  const direct = lookUpSidecarFor(imageFilename);
  if (direct) return direct;

  // "IMG_1234-edited.jpg" borrows the sidecar of "IMG_1234.jpg". A duplicate
  // counter can sit on either side of "-edited", and it stays on the name we
  // borrow from: "IMG_1234(1)-edited.jpg" borrows from "IMG_1234(1).jpg".
  const dot = imageFilename.lastIndexOf('.');
  const stem = dot === -1 ? imageFilename : imageFilename.slice(0, dot);
  const extension = dot === -1 ? '' : imageFilename.slice(dot);
  const originalName = stem.replace(/-edited(\(\d+\))?$/i, '$1') + extension;

  if (originalName !== imageFilename) {
    const inherited = lookUpSidecarFor(originalName);
    if (inherited) return inherited;
  }

  return null;
}


/**
 * Splits a filename into base, duplicate counter and extension.
 *   "IMG_1234.jpg"            -> base "IMG_1234",     counter null, extension ".jpg"
 *   "IMG_1234(1).jpg"         -> base "IMG_1234",     counter "1",  extension ".jpg"
 *   "IMG_1234.jpg(1).json"    -> base "IMG_1234.jpg", counter "1",  extension ".json"
 */
function splitFilename(filename) {
  // Find the last dot to separate the extension.
  const dot = filename.lastIndexOf('.');
  let base = dot === -1 ? filename : filename.slice(0, dot);
  const extension = dot === -1 ? '' : filename.slice(dot);

  // Pull off a trailing "(1)" style counter if there is one.
  let counter = null;
  const counterMatch = base.match(/^(.*)\((\d+)\)$/);
  if (counterMatch) {
    base = counterMatch[1];
    counter = counterMatch[2];
  }

  return { base, counter, extension };
}


// ---------------------------------------------------------------------------
// PART 2 - READING THE INFORMATION OUT OF A SIDECAR
// ---------------------------------------------------------------------------

/**
 * Pulls the capture date and GPS out of one parsed sidecar object.
 * Returns { timestamp, latitude, longitude, altitude, timezone } where anything
 * missing is null.
 */
function readSidecarData(json) {
  const result = {
    timestamp: null, latitude: null, longitude: null, altitude: null, timezone: null
  };

  // The date is a Unix timestamp in SECONDS, stored as text, in UTC.
  if (json.photoTakenTime && json.photoTakenTime.timestamp) {
    const seconds = Number(json.photoTakenTime.timestamp);
    if (!Number.isNaN(seconds) && seconds > 0) result.timestamp = seconds;
  }

  // Prefer geoData. Fall back to geoDataExif. Ignore either one if it is all zeros,
  // because Google writes 0,0 to mean "we have no location for this photo".
  const location = pickLocation(json.geoData) || pickLocation(json.geoDataExif);
  if (location) {
    result.latitude = location.latitude;
    result.longitude = location.longitude;
    result.altitude = location.altitude;

    // The timezone comes from WHERE the photo was taken, never from this computer.
    result.timezone = lookupTimezone(location.latitude, location.longitude);
  }

  return result;
}


// ---------------------------------------------------------------------------
// PART 2a - WHERE A DATE CAME FROM, AND WHY THAT MATTERS
//
// This is the honest bit, and it is the thing no other tool does.
//
// When a photo has no date inside it, Google's sidecar still has a
// photoTakenTime. It is tempting to treat that as the recovered capture date.
// It usually is NOT. For photos that were uploaded or shared into the library
// rather than shot on the device, that timestamp is when Google first saw the
// photo - the moment it entered the library.
//
// The giveaway is clustering. Ten photos taken over ten different years, all
// uploaded in one go, come out of the sidecar with timestamps a few seconds
// apart. A real camera roll never looks like that. So we detect the pattern and
// say so, rather than writing ten identical wrong dates into ten photos and
// calling it a repair.
// ---------------------------------------------------------------------------

/**
 * Where the date for one file comes from.
 *   'photo'  - it was already inside the file. This is the trustworthy one.
 *   'google' - only Google's sidecar has it, so it is Google's record of when
 *              the photo arrived, which may not be when it was taken.
 *   'none'   - there is no date anywhere.
 */
function dateSourceFor(row) {
  if (row.existing && row.existing.hasDate) return 'photo';
  // A Live Photo's video half has no metadata of its own, but its still half
  // does, and they are the same moment. That is a real capture time.
  if (row.partnerClock) return 'photo';
  if (row.data && row.data.timestamp) return 'google';
  return 'none';
}


/**
 * Pairs up the two halves of a Live Photo.
 *
 * An iPhone Live Photo comes out of Takeout as two files sharing one name -
 * IMG_9661.HEIC and IMG_9661.MP4 - and Google writes a sidecar for the still
 * half only. Left alone, the video half has no date from anywhere and lands
 * stamped with the moment you unzipped, which is the exact problem this tool
 * exists to fix. In a real 65-file export that was ten of the twelve videos.
 *
 * So a video borrows the capture time of the still it shares a name with. Same
 * name, same folder, same moment. Nothing is written inside the video - this
 * only decides the date that goes on the outside of it.
 */
function linkLivePhotoPartners() {
  const stills = new Map();

  for (const row of scannedRows) {
    if (row.bucket === 'Video') continue;
    if (row.existing && row.existing.clock) stills.set(stemKey(row), row);
  }

  for (const row of scannedRows) {
    row.partnerClock = null;
    if (row.bucket !== 'Video') continue;

    const partner = stills.get(stemKey(row));
    if (partner) {
      row.partnerClock = partner.existing.clock;
      row.partnerName = partner.name;
    }
  }
}


/**
 * A file's folder plus its name without the extension, lowercased.
 * Folder-scoped on purpose: two albums can both hold an "IMG_0001", and pairing
 * across albums would hand a video somebody else's date.
 */
function stemKey(row) {
  const dot = row.path.lastIndexOf('.');
  const cut = row.path.lastIndexOf('/');
  return (dot > cut ? row.path.slice(0, dot) : row.path).toLowerCase();
}


// Sidecar times this close together are one upload batch, not separate moments.
const CLUSTER_WINDOW_SECONDS = 300;      // five minutes
const CLUSTER_MIN_FILES = 3;             // below this it is a coincidence, not a pattern

// Filled in by findDateClusters() after every scan.
let dateClusters = [];


/**
 * Looks for groups of date-less files whose sidecar timestamps sit almost on
 * top of each other. That pattern means an upload batch, and it is the evidence
 * that those timestamps are not capture times.
 */
function findDateClusters() {
  dateClusters = [];

  const stamps = scannedRows
    .filter(row => dateSourceFor(row) === 'google')
    .map(row => ({ row: row, at: row.data.timestamp }))
    .sort((a, b) => a.at - b.at);

  let group = [];

  function closeGroup() {
    if (group.length >= CLUSTER_MIN_FILES) {
      dateClusters.push({
        count: group.length,
        spanSeconds: group[group.length - 1].at - group[0].at,
        at: group[0].at,
        rows: group.map(g => g.row)
      });
    }
    group = [];
  }

  for (const stamp of stamps) {
    // Measured from the START of the group, not from the previous stamp. Chaining
    // off the previous one would let a long trickle of photos taken minutes apart
    // link into one enormous "batch" and produce a claim we cannot stand behind.
    // A cluster can never span more than the window this way.
    if (group.length > 0 && stamp.at - group[0].at > CLUSTER_WINDOW_SECONDS) {
      closeGroup();
    }
    group.push(stamp);
  }
  closeGroup();

  // Mark the rows themselves, so the table can show which ones are involved.
  for (const row of scannedRows) row.inCluster = false;
  for (const cluster of dateClusters) {
    for (const row of cluster.rows) row.inCluster = true;
  }
}


/** "16 seconds", "4 minutes" - how tightly one cluster is packed. */
function describeSpan(seconds) {
  if (seconds < 1) return 'the same second';
  if (seconds < 90) return seconds + ' ' + plural(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  return minutes + ' ' + plural(minutes, 'minute');
}


/** Returns a usable location object, or null if it is missing or is 0,0. */
function pickLocation(geo) {
  if (!geo) return null;

  const latitude = Number(geo.latitude);
  const longitude = Number(geo.longitude);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;

  // 0,0 is in the ocean off Africa. Google uses it to mean "no location".
  if (latitude === 0 && longitude === 0) return null;

  const altitude = Number(geo.altitude);
  return {
    latitude,
    longitude,
    altitude: Number.isNaN(altitude) ? null : altitude
  };
}


// ---------------------------------------------------------------------------
// PART 2b - WORKING OUT THE TIMEZONE FROM THE GPS POSITION
//
// Google stores every capture time in UTC. A photo taken at 3pm in London in July is
// stored as 14:00 UTC, because London was on BST (UTC+1) that day.
//
// We want the photo to end up showing 15:00, the time the clock on the wall actually
// said. To do that we need to know which timezone the photo was taken in, and that
// comes from its GPS position - NOT from the timezone this computer happens to be set
// to. A holiday photo should read the same whether you run this tool at home or abroad.
//
// Two pieces do the work:
//   - tz-lookup turns a latitude and longitude into a timezone name, e.g. "Europe/London".
//   - The browser's own Intl support turns a UTC moment plus that name into the local
//     wall clock time, and it knows the daylight saving rules for every date in history.
// ---------------------------------------------------------------------------

/**
 * Turns a GPS position into a timezone name like "Europe/London" or "America/New_York".
 * Returns null if the position is unusable, in which case we fall back to UTC.
 */
function lookupTimezone(latitude, longitude) {
  try {
    return tzlookup(latitude, longitude);
  } catch (e) {
    // tz-lookup throws on out-of-range coordinates. A bad position is not worth
    // stopping for, so treat it as "we don't know" and let the caller use UTC.
    return null;
  }
}


/**
 * Reads the wall clock time of one moment, as seen in one timezone.
 * Give it 1754140000 and "Europe/London" and you get back the year, month, day, hour,
 * minute and second that a clock in London would have been showing at that instant.
 *
 * Pass null for the timezone to get UTC, which is our fallback for photos with no GPS.
 */
function wallClockIn(unixSeconds, timezone) {
  const zone = timezone || 'UTC';

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hourCycle: 'h23',        // 00 to 23, so midnight is 00 and never 24
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  // formatToParts hands back the pieces separately, which saves us picking apart text
  // that changes shape from one browser to the next.
  const pieces = {};
  for (const part of formatter.formatToParts(new Date(unixSeconds * 1000))) {
    pieces[part.type] = part.value;
  }

  return {
    year: Number(pieces.year),
    month: Number(pieces.month),
    day: Number(pieces.day),
    // A couple of older browsers still say "24" for midnight. Pin it back to 00.
    hour: Number(pieces.hour) % 24,
    minute: Number(pieces.minute),
    second: Number(pieces.second)
  };
}


/**
 * How far ahead of, or behind, UTC a timezone was at one particular moment, in minutes.
 * London in July gives 60. New York in July gives -240. London in January gives 0.
 *
 * It works by asking what the clock said locally, pretending that reading was UTC, and
 * measuring the gap against the real UTC moment. That gap IS the offset, and because it
 * is measured at that exact moment it gets daylight saving right automatically.
 */
function timezoneOffsetMinutes(unixSeconds, timezone) {
  const clock = wallClockIn(unixSeconds, timezone);
  const asIfUtc = Date.UTC(
    clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second
  );
  return Math.round((asIfUtc - unixSeconds * 1000) / 60000);
}


/** Writes an offset as EXIF wants to see it: "+01:00", "-04:00", "+00:00". */
function formatOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const total = Math.abs(minutes);
  return sign + pad(Math.floor(total / 60), 2) + ':' + pad(total % 60, 2);
}


// ---------------------------------------------------------------------------
// PART 2c - READING THE DATE AND GPS A PHOTO ALREADY HAS
//
// This is the part that makes the tool tell the truth about how little it
// usually needs to do.
//
// Google does NOT strip the EXIF out of a photo that already had it. A picture
// straight off a phone or a camera comes out of Takeout with its
// DateTimeOriginal and its GPS still inside it. What Takeout resets is the
// FILE's modified date, because unzipping stamps every file with the moment it
// was extracted. That is a different field, and it is why every photo reads
// "today" in Finder and Explorer.
//
// The sidecar is genuinely the only home for two things:
//   - photos that never had EXIF in the first place: screenshots, pictures
//     saved out of WhatsApp or Messenger, scans, downloads, anything shared
//     into the library
//   - any date, time, timezone or location edited INSIDE Google Photos, because
//     those edits are never written back into the file
//
// So we read what each photo already carries BEFORE writing anything, and say
// so on screen.
// ---------------------------------------------------------------------------

// How much of the front of a JPEG we read to find its EXIF.
//
// A JPEG segment records its own length in a 16-bit number, so the EXIF block
// can never be larger than 64 KB, and the format puts it at the very front of
// the file. 128 KB is therefore more than enough to hold all of it, while
// staying a small read per photo - reading whole files here would make the scan
// as slow as the download.
const EXIF_SCAN_BYTES = 128 * 1024;


/**
 * Reads the date and location one file ALREADY carries, without reading the
 * whole thing.
 *
 * Returns { checked, known, hasDate, clock, hasGps }.
 *   checked - false when this kind of file was never opened at all. Video is
 *             the case: its dates live in a completely different place and this
 *             tool does not read them. "Not checked" is not the same as "no".
 *   known   - false when the file was opened but could not be understood.
 *   clock   - the capture date as year/month/day/hour/minute/second, or null.
 *
 * Reading is NOT the same as support. Nothing here writes to a HEIC, a RAW file
 * or a video - they are copied through untouched. We read them only so the
 * screen can say honestly what they already have, and so their file date can be
 * set correctly on the way into the zip.
 */
async function readExistingMetadata(file, bucket) {
  const notChecked = { checked: false, known: false, hasDate: false, clock: null,
                       hasGps: false, format: null };
  const unreadable = { checked: true, known: false, hasDate: false, clock: null,
                       hasGps: false, format: null };

  // Video keeps its dates in the container, not in EXIF. We do not read those.
  if (bucket === 'Video' || bucket === 'other') return notChecked;

  try {
    const head = new Uint8Array(await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer());
    const binary = bytesToBinaryString(head);

    // The format is decided by LOOKING AT THE BYTES, never by the file's name.
    // Takeout exports are full of files whose extension does not match their
    // contents - a real export turned out to have four ".HEIC" files that were
    // plain JPEGs inside. Trusting the name would have reported them as having
    // no date, which is exactly the kind of wrong answer this pass is meant to
    // stop. The answer is kept on the row, because the decision to REWRITE a
    // file has to rest on what it really is, not on what it is called.
    const format = sniffFormat(binary);
    const nothing = { checked: true, known: true, hasDate: false, clock: null,
                      hasGps: false, format: format };
    let exifData = null;

    switch (format) {
      case 'jpeg':
        exifData = findExifSegment(binary);
        break;
      case 'tiff':
        exifData = binary;      // a RAW file simply IS a TIFF
        break;
      case 'isobmff':
        exifData = await findExifInHeif(file, binary);
        break;
      case 'png':
        exifData = findExifInPng(binary);
        break;
    }

    // No metadata block at all. That IS an answer, and it is the interesting
    // one: this is a screenshot or a shared image, which is why the tool exists.
    if (!exifData) return nothing;

    let read = readTiffBasics(exifData);

    // The block we want can sit deeper into the file than our first read went.
    // RAW files are the case: they are enormous and their EXIF can be a long way
    // in. Go back for more rather than reporting a date that is simply out of
    // reach as "no date".
    if (read.truncated) {
      const more = new Uint8Array(await file.slice(0, DEEP_SCAN_BYTES).arrayBuffer());
      const deep = bytesToBinaryString(more);
      const again = sniffFormat(deep) === 'tiff' ? deep : findExifSegment(deep);
      if (again) read = readTiffBasics(again);
    }

    if (read.truncated) return unreadable;

    return {
      checked: true,
      known: true,
      hasDate: Boolean(read.clock),
      clock: read.clock,
      hasGps: read.hasGps,
      format: format
    };
  } catch (e) {
    return unreadable;
  }
}


// How far in we are willing to go on a second attempt, for files whose metadata
// is not near the front. A RAW file can be 25 MB, so this is a real read - but
// it only happens for the handful of files that need it.
const DEEP_SCAN_BYTES = 8 * 1024 * 1024;


// The width in bytes of every TIFF value type. Type 11 is FLOAT and type 12 is
// DOUBLE, and it is those two that RAW files and real HEIC photos carry and that
// stricter readers choke on.
const TIFF_TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1,
                          8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };


/**
 * Reads the only two things we care about out of a TIFF block: the capture date
 * and whether there is a usable location.
 *
 * WHY NOT USE PIEXIF FOR THIS. piexif refuses an entire file the moment it meets
 * a tag type it does not recognize, and both RAW files and genuine HEIC photos
 * carry those routinely - a real export had a DNG and three HEICs that it threw
 * on, which would have been reported on screen as "no date" when all four had
 * one. We only need two facts, so a reader that steps over what it does not
 * understand gets the right answer where a stricter one gives up. piexif is
 * still the only thing that WRITES anything.
 *
 * A TIFF block is a header, then a chain of directories. Each directory is a
 * count followed by 12-byte entries: tag, type, how many, and then either the
 * value itself or - if it does not fit in four bytes - where to find it.
 */
function readTiffBasics(tiff) {
  const result = { clock: null, hasGps: false, truncated: false };

  const little = tiff.slice(0, 2) === 'II';
  if (!little && tiff.slice(0, 2) !== 'MM') return result;

  function u16(at) {
    if (at + 2 > tiff.length) { result.truncated = true; return 0; }
    return little
      ? tiff.charCodeAt(at) | (tiff.charCodeAt(at + 1) << 8)
      : (tiff.charCodeAt(at) << 8) | tiff.charCodeAt(at + 1);
  }

  function u32(at) {
    if (at + 4 > tiff.length) { result.truncated = true; return 0; }
    const b = [tiff.charCodeAt(at), tiff.charCodeAt(at + 1),
               tiff.charCodeAt(at + 2), tiff.charCodeAt(at + 3)];
    if (little) b.reverse();
    // Multiplied rather than shifted: a shift would turn the top bit negative.
    return b[0] * 16777216 + (b[1] << 16) + (b[2] << 8) + b[3];
  }

  /** Reads one directory into a table of tag number -> where its value is. */
  function readDirectory(at) {
    const entries = {};
    if (at <= 0) return entries;
    if (at + 2 > tiff.length) { result.truncated = true; return entries; }

    const count = u16(at);
    for (let i = 0; i < count; i++) {
      const entry = at + 2 + i * 12;
      if (entry + 12 > tiff.length) { result.truncated = true; break; }

      const tag = u16(entry);
      const type = u16(entry + 2);
      const many = u32(entry + 4);
      const size = (TIFF_TYPE_SIZES[type] || 0) * many;

      // Four bytes or fewer and the value sits in the entry itself. Anything
      // bigger and those four bytes are a pointer instead.
      entries[tag] = { type: type, count: many, size: size,
                       at: size > 4 ? u32(entry + 8) : entry + 8 };
    }
    return entries;
  }

  const ifd0 = readDirectory(u32(4));

  // 0x8769 points at the EXIF directory, 0x8825 at the GPS one.
  const exifIfd = ifd0[0x8769] ? readDirectory(u32(ifd0[0x8769].at)) : {};
  const gpsIfd = ifd0[0x8825] ? readDirectory(u32(ifd0[0x8825].at)) : {};

  // 0x9003 is DateTimeOriginal, stored as text with a trailing zero byte.
  const dateEntry = exifIfd[0x9003];
  if (dateEntry && dateEntry.type === 2 && dateEntry.count > 1) {
    if (dateEntry.at + dateEntry.count > tiff.length) result.truncated = true;
    else {
      // Take the whole run and strip terminators, rather than assuming the last
      // byte is a NUL - plenty of cameras write the string without one, and
      // chopping a character then loses the final digit of the seconds.
      const text = tiff.slice(dateEntry.at, dateEntry.at + dateEntry.count)
        .replace(/[\0\s]+$/, '');
      result.clock = parseExifDateTime(text);
    }
  }

  // 0x0002 is latitude and 0x0004 is longitude, each three fractions:
  // degrees, minutes and seconds.
  const latitude = degreesFrom(gpsIfd[0x0002]);
  const longitude = degreesFrom(gpsIfd[0x0004]);
  result.hasGps = latitude !== 0 || longitude !== 0;

  function degreesFrom(entry) {
    if (!entry || entry.count < 3 || entry.at + 24 > tiff.length) return 0;
    let total = 0;
    for (let i = 0; i < 3; i++) {
      const top = u32(entry.at + i * 8);
      const bottom = u32(entry.at + i * 8 + 4);
      total += (bottom ? top / bottom : 0) / Math.pow(60, i);
    }
    return total;
  }

  return result;
}


/**
 * What KIND of file is this really, judged by its first few bytes?
 *
 * Never by its extension. Takeout hands out files whose name and contents
 * disagree, and a wrong guess here becomes a wrong answer on screen.
 */
function sniffFormat(binary) {
  if (binary.slice(0, 2) === '\xff\xd8') return 'jpeg';
  if (binary.slice(0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
  if (isTiffHeader(binary)) return 'tiff';
  // HEIC and friends: a box-based file always names its type at byte four.
  if (binary.slice(4, 8) === 'ftyp') return 'isobmff';
  return 'unknown';
}


/** Does this run of bytes start with a TIFF header? "II" little endian, "MM" big. */
function isTiffHeader(binary) {
  return binary.slice(0, 4) === 'II\x2a\x00' || binary.slice(0, 4) === 'MM\x00\x2a';
}


/**
 * Finds the EXIF block in a PNG.
 *
 * A PNG is a signature followed by a chain of chunks, each one a 4-byte length,
 * a 4-letter name, the data, and a checksum. The one we want is called "eXIf".
 * Most PNGs - screenshots especially - do not have one at all.
 */
function findExifInPng(binary) {
  if (binary.slice(0, 8) !== '\x89PNG\r\n\x1a\n') return null;

  let head = 8;
  while (head + 8 <= binary.length) {
    const length = readUint32(binary, head);
    const name = binary.slice(head + 4, head + 8);

    // Only IEND truly ends it. eXIf is allowed after the image data, and IDAT
    // chunks are stepped over by the arithmetic below without being read.
    if (name === 'IEND') return null;
    if (name === 'eXIf') {
      const end = head + 8 + length;
      if (end > binary.length) return null;
      const chunk = binary.slice(head + 8, end);
      // The chunk is meant to be a bare TIFF block, but some encoders put the
      // "Exif\0\0" introduction in front of it anyway. Accept either.
      return chunk.slice(0, 6) === 'Exif\x00\x00' ? chunk.slice(6) : chunk;
    }

    head += 12 + length;   // length + name + data + checksum
  }

  return null;
}


/**
 * Finds the EXIF block in a HEIC photo.
 *
 * HEIC is built out of nested "boxes", each one a 4-byte length and a 4-letter
 * name. Metadata lives in a box called "meta", which holds a list of items
 * ("iinf") and a table saying where each item's bytes are ("iloc"). We look for
 * the item called "Exif" and then go and read it.
 *
 * The item's bytes can sit anywhere in the file, so if it falls outside the
 * chunk we already read, we go back and read just that part. Never the whole
 * photo - a HEIC off a phone can be several megabytes.
 */
async function findExifInHeif(file, binary) {
  const meta = findBox(binary, 0, binary.length, 'meta');
  if (!meta) return null;

  // "meta" is a full box: four bytes of version and flags before its children.
  const itemId = findExifItemId(binary, meta.start + 4, meta.end);
  if (itemId === null) return null;

  const location = findItemLocation(binary, meta.start + 4, meta.end, itemId);
  if (!location) return null;

  // Read the item's bytes, going back to the file if we do not already have them.
  let itemBytes;
  if (location.offset + location.length <= binary.length) {
    itemBytes = binary.slice(location.offset, location.offset + location.length);
  } else {
    const slice = await file.slice(location.offset, location.offset + location.length).arrayBuffer();
    itemBytes = bytesToBinaryString(new Uint8Array(slice));
  }

  // The item starts with a few bytes of padding before the TIFF block proper.
  // Rather than trust the padding length, just find where the TIFF block starts.
  for (let i = 0; i < Math.min(itemBytes.length, 64); i++) {
    if (isTiffHeader(itemBytes.slice(i, i + 4))) return itemBytes.slice(i);
  }

  return null;
}


/** Walks a run of boxes looking for one by name. Returns where its contents are. */
function findBox(binary, from, to, wanted) {
  let head = from;

  while (head + 8 <= to) {
    let size = readUint32(binary, head);
    const name = binary.slice(head + 4, head + 8);
    let start = head + 8;

    if (size === 1) {
      // A 64-bit size follows. We only care about the low half - a metadata box
      // is never four gigabytes.
      size = readUint32(binary, head + 12);
      start = head + 16;
    } else if (size === 0) {
      size = to - head;                 // runs to the end
    }

    if (size < 8) return null;          // nonsense: would loop forever

    const end = Math.min(head + size, to);
    if (name === wanted) return { start: start, end: end };

    head += size;
  }

  return null;
}


/** Finds the ID of the item called "Exif" in the item info ("iinf") box. */
function findExifItemId(binary, from, to) {
  const iinf = findBox(binary, from, to, 'iinf');
  if (!iinf) return null;

  const version = binary.charCodeAt(iinf.start);
  // Entry count is 2 bytes in version 0 and 4 bytes after that.
  let head = iinf.start + 4 + (version === 0 ? 2 : 4);

  while (head + 8 <= iinf.end) {
    const size = readUint32(binary, head);
    if (size < 8) return null;

    if (binary.slice(head + 4, head + 8) === 'infe') {
      const infeVersion = binary.charCodeAt(head + 8);
      if (infeVersion >= 2) {
        // version 2 uses a 2-byte item ID, version 3 uses 4.
        const idBytes = infeVersion === 2 ? 2 : 4;
        const id = infeVersion === 2 ? readUint16(binary, head + 12) : readUint32(binary, head + 12);
        // Then a 2-byte protection index, then the four letters of the type.
        const type = binary.slice(head + 12 + idBytes + 2, head + 12 + idBytes + 6);
        if (type === 'Exif') return id;
      }
    }

    head += size;
  }

  return null;
}


/**
 * Looks up where one item's bytes live, in the item location ("iloc") box.
 *
 * This box packs its field widths into half-bytes to save room, which is why
 * there is so much shifting about below.
 */
function findItemLocation(binary, from, to, wantedId) {
  const iloc = findBox(binary, from, to, 'iloc');
  if (!iloc) return null;

  const version = binary.charCodeAt(iloc.start);
  let head = iloc.start + 4;

  const offsetSize = binary.charCodeAt(head) >> 4;
  const lengthSize = binary.charCodeAt(head) & 0x0f;
  const baseOffsetSize = binary.charCodeAt(head + 1) >> 4;
  const indexSize = version >= 1 ? (binary.charCodeAt(head + 1) & 0x0f) : 0;
  head += 2;

  const itemCount = version < 2 ? readUint16(binary, head) : readUint32(binary, head);
  head += version < 2 ? 2 : 4;

  for (let i = 0; i < itemCount && head < iloc.end; i++) {
    const id = version < 2 ? readUint16(binary, head) : readUint32(binary, head);
    head += version < 2 ? 2 : 4;

    if (version >= 1) head += 2;        // reserved bits and construction method
    head += 2;                          // data reference index

    const baseOffset = readSized(binary, head, baseOffsetSize);
    head += baseOffsetSize;

    const extentCount = readUint16(binary, head);
    head += 2;

    // If all three widths are zero the inner loop cannot advance, and a
    // malformed box would spin for as many iterations as its count claims.
    if (indexSize + offsetSize + lengthSize === 0) return null;

    for (let e = 0; e < extentCount && head < iloc.end; e++) {
      head += indexSize;
      const offset = readSized(binary, head, offsetSize);
      head += offsetSize;
      const length = readSized(binary, head, lengthSize);
      head += lengthSize;

      // The first extent is the one we want; EXIF is never split up.
      if (id === wantedId && e === 0 && length > 0) {
        return { offset: baseOffset + offset, length: length };
      }
    }
  }

  return null;
}


/** Reads a big-endian whole number of the given width, in bytes. */
function readSized(binary, at, width) {
  let value = 0;
  for (let i = 0; i < width; i++) value = value * 256 + binary.charCodeAt(at + i);
  return value;
}

/** Reads a 4-byte big-endian number. */
function readUint32(binary, at) { return readSized(binary, at, 4); }

/** Reads a 2-byte big-endian number. */
function readUint16(binary, at) { return readSized(binary, at, 2); }


/**
 * Finds the EXIF block at the front of a JPEG and hands back the raw TIFF block
 * inside it, with the "Exif\0\0" introduction stripped off.
 *
 * A JPEG is a chain of segments. Each one starts with the byte 0xFF, then a
 * marker byte saying what it is, then its own length. We walk that chain until
 * we find the EXIF one, and stop as soon as the compressed image data starts,
 * because nothing past that point is metadata.
 *
 * Returns null when the photo has no EXIF, when it is not a JPEG, or when the
 * chain runs off the end of the slice we read. That last case means "we could
 * not tell", which is better than guessing.
 */
function findExifSegment(binary) {
  if (binary.slice(0, 2) !== '\xff\xd8') return null;     // not a JPEG at all

  let head = 2;

  while (head + 4 <= binary.length) {
    // A segment is allowed to be padded with extra 0xFF bytes in front of its
    // marker. Step over any of those before reading the marker itself.
    while (head + 1 < binary.length &&
           binary.charCodeAt(head) === 0xff &&
           binary.charCodeAt(head + 1) === 0xff) head++;

    if (binary.charCodeAt(head) !== 0xff) return null;    // the chain is broken

    const marker = binary.charCodeAt(head + 1);

    // 0xDA starts the compressed image data and 0xD9 ends the file. Either way
    // there is no metadata left to find.
    if (marker === 0xda || marker === 0xd9) return null;

    const length = (binary.charCodeAt(head + 2) << 8) | binary.charCodeAt(head + 3);
    if (length < 2) return null;                          // nonsense: would loop forever

    const end = head + 2 + length;

    // APP1 carrying the marker "Exif\0\0" is the one we want. The TIFF block
    // starts immediately after those six bytes.
    if (marker === 0xe1 && binary.slice(head + 4, head + 10) === 'Exif\x00\x00') {
      // Only trust it if the whole segment is inside what we actually read.
      return end <= binary.length ? binary.slice(head + 10, end) : null;
    }

    head = end;
  }

  return null;
}


/**
 * Reads an EXIF date string - "2019:07:14 15:23:05" - into its parts.
 *
 * Returns null for anything missing or unusable. Plenty of photos in the wild
 * carry a placeholder of all zeros or all spaces, and that means "no date", not
 * "the year 0".
 */
function parseExifDateTime(text) {
  if (!text) return null;

  const match = String(text).match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;

  const clock = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6])
  };

  if (clock.year === 0 || clock.month === 0 || clock.day === 0) return null;

  return clock;
}


// ---------------------------------------------------------------------------
// PART 3 - THE SCREEN
//
// Three screens, one at a time: choosing a folder, waiting, and the answer.
// Nothing in this part knows how to read a sidecar or write EXIF - it only
// decides what the person looking at the page can see.
// ---------------------------------------------------------------------------

// --- Screen 1: choosing a folder, or the zips Google sent
const picker = document.getElementById('folderPicker');
const zipPicker = document.getElementById('zipPicker');
const chooseZipButton = document.getElementById('chooseZipButton');
const dropZone = document.getElementById('dropZone');
const dzIdle = document.getElementById('dzIdle');
const dzDragover = document.getElementById('dzDragover');
const dzRejected = document.getElementById('dzRejected');
const dzDragName = document.getElementById('dzDragName');
const dzRejectHeadline = document.getElementById('dzRejectHeadline');
const dzRejectBody = document.getElementById('dzRejectBody');
const dzRejectName = document.getElementById('dzRejectName');
const dzNoPicker = document.getElementById('dzNoPicker');
const folderNotice = document.getElementById('folderNotice');
const chooseButton = document.getElementById('chooseButton');
const tryAgainButton = document.getElementById('tryAgainButton');

// --- The three screens themselves
const phaseIdle = document.getElementById('phaseIdle');
const phaseWorking = document.getElementById('phaseWorking');
const phaseDone = document.getElementById('phaseDone');

// --- Screen 2: the wait
const workHeading = document.getElementById('workHeading');
const workEta = document.getElementById('workEta');
const workCount = document.getElementById('workCount');
const workBar = document.getElementById('workBar');
const tickerFile = document.getElementById('tickerFile');
const workElapsed = document.getElementById('workElapsed');
const tallyBoxes = {
  haveDate: document.getElementById('tallyHaveDate'),
  needDate: document.getElementById('tallyNeedDate'),
  noDate: document.getElementById('tallyNoDate')
};
const stopButton = document.getElementById('stopButton');

// --- Screen 3: the answer
const tilesBox = document.getElementById('tiles');
const scanSummary = document.getElementById('scanSummary');
const clusterNotice = document.getElementById('clusterNotice');
const zipNotice = document.getElementById('zipNotice');
const dzIncomplete = document.getElementById('dzIncomplete');
const dzIncompleteHeadline = document.getElementById('dzIncompleteHeadline');
const dzIncompleteBody = document.getElementById('dzIncompleteBody');
const incompleteBackButton = document.getElementById('incompleteBackButton');
const incompleteGoButton = document.getElementById('incompleteGoButton');

// Held while the "a part looks missing" question is on screen: the run to start
// if the answer is "use these anyway". Cleared as soon as it is answered.
let pendingZipRun = null;

// Set only for the one re-entry that follows that answer, so the same question
// cannot be asked twice about the same set.
let skipMissingPartsCheck = false;
const onlyMissingBox = document.getElementById('onlyMissing');
const googleDatesBox = document.getElementById('googleDates');
const resultsNotices = document.getElementById('resultsNotices');
const downloadButton = document.getElementById('downloadButton');
const downloadLabel = document.getElementById('downloadLabel');
const previewReportButton = document.getElementById('previewReportButton');
const resultsReportButton = document.getElementById('resultsReportButton');
const startOverButton = document.getElementById('startOverButton');
const progressLine = document.getElementById('progress');
const skippedBox = document.getElementById('skipped');
const toggleTable = document.getElementById('toggleTable');
const toggleTableLabel = document.getElementById('toggleTableLabel');
const tableWrap = document.getElementById('tableWrap');
const chipsBox = document.getElementById('chips');
const tableBody = document.getElementById('resultsBody');
const pagerBox = document.getElementById('pager');


// --- What we know so far ---------------------------------------------------

// The results of the last scan, so the download button can use them.
let scannedRows = [];

// A count of every file the picker handed us, split up by type.
let fileInventory = null;

// The paths of the JSON sidecars. Only the names are kept, never the files.
let sidecarPaths = [];

// Anything that went wrong while opening zips: a part that would not open, a
// missing part number, files that had to be skipped. These are shown on the
// results screen, because a partly-read set of zips must never be mistaken for
// a complete one.
let zipNotes = [];

// The names of the zips this run came from, empty when a folder was used. The
// results screen says which it was, so nobody has to remember.
let zipSourceNames = [];

// What the last download run actually did. Null until a run finishes.
let lastRunSummary = null;

// Set by the Stop button. Both long loops check it between files.
let stopRequested = false;

// Set when the READING loop was cut short, so the results screen can admit that
// the numbers below describe only part of the folder.
let scanStopped = false;

// The three running tallies shown during the wait.
let tally = { haveDate: 0, needDate: 0, noDate: 0 };

// The table is closed until asked for. That default IS the design: someone
// who never opens it has been served properly.
let tableExpanded = false;
let currentFilter = 'all';
let currentPage = 1;
const ROWS_PER_PAGE = 50;

// The elapsed clock, which keeps ticking whether or not anything else moves.
let elapsedTimer = null;
let startedAt = 0;


// --- Wiring ----------------------------------------------------------------

chooseButton.addEventListener('click', function () { picker.click(); });
chooseZipButton.addEventListener('click', function () { zipPicker.click(); });
tryAgainButton.addEventListener('click', function () { showDropState('idle'); });

incompleteBackButton.addEventListener('click', function () {
  pendingZipRun = null;
  picker.value = '';
  zipPicker.value = '';
  showDropState('idle');
  // Put focus back on the control that starts the job again, rather than
  // leaving it on a button that has just been hidden.
  if (chooseZipButton) chooseZipButton.focus();
});

incompleteGoButton.addEventListener('click', function () {
  const go = pendingZipRun;
  pendingZipRun = null;
  showDropState('idle');
  if (go) go();
});

picker.addEventListener('change', async function (event) {
  const files = Array.from(event.target.files);
  if (files.length === 0 || runInProgress) return;

  // The folder picker gets the same byte check as a drop. Somebody who has
  // downloaded the parts but not unpacked them is quite likely to reach for
  // "Choose folder" and hand over the folder the zips are sitting in, and
  // without this those zips would be scanned as though they were photos and
  // copied into the output as junk.
  const split = await splitOutZips(files);
  if (split.zips.length > 0) {
    openZips(split.zips, split.rest);
    return;
  }

  zipNotes = [];
  zipSourceNames = [];
  handleFolder(files);
});

// The zip chooser is a second, ordinary file input. It has to be separate from
// the folder one, because an input asking for a directory cannot also offer
// files, and a person who has not unpacked anything needs the second kind.
zipPicker.addEventListener('change', async function (event) {
  const chosen = Array.from(event.target.files);
  if (chosen.length === 0 || runInProgress) return;

  const split = await splitOutZips(chosen);
  if (split.zips.length === 0) {
    showRejected(
      'None of those are zip files',
      'Whatever they are called, none of them is an archive inside. Choose the files Google sent you, or use Choose folder if you already unpacked them.',
      chosen.length === 1 ? chosen[0].name : ''
    );
    return;
  }
  // Anything chosen that is not a zip comes along, for the oversized-video case.
  openZips(split.zips, split.rest);
});

stopButton.addEventListener('click', function () {
  stopRequested = true;
  stopButton.disabled = true;
  stopButton.textContent = 'Stopping...';
});

// Ticking or clearing the box changes what the download will do, so the summary
// sentence and the table have to be redrawn to match. Nothing is written here.
// Either box changes what the download will do, so the summary, the tiles and
// the table are redrawn to match. Nothing is written here.
function optionChanged() {
  drawTiles();
  drawScanSummary();
  drawChips();
  if (tableExpanded) drawTable();
}

onlyMissingBox.addEventListener('change', optionChanged);
googleDatesBox.addEventListener('change', optionChanged);

// Anything that escapes fixPhotos would otherwise leave the page stuck on the
// waiting screen forever, with no way back and no explanation.
downloadButton.addEventListener('click', function () {
  fixPhotos().catch(function (e) {
    endWork();
    downloadButton.disabled = false;
    downloadButton.removeAttribute('aria-busy');
    progressLine.textContent = 'Something went wrong building the download: ' +
      (e && e.message ? e.message : String(e)) +
      '. Your own files were not touched. Press Start over to try again.';
    showPhase('done');
  });
});
previewReportButton.addEventListener('click', function () { downloadReport('preview'); });
resultsReportButton.addEventListener('click', function () { downloadReport('results'); });
startOverButton.addEventListener('click', function () { startOver(); });

toggleTable.addEventListener('click', function (event) {
  event.preventDefault();
  tableExpanded = !tableExpanded;
  tableWrap.hidden = !tableExpanded;
  toggleTable.setAttribute('aria-expanded', String(tableExpanded));
  toggleTableLabel.textContent =
    (tableExpanded ? 'Hide all ' : 'Show all ') + formatCount(allTableRows().length) + ' files';
  if (tableExpanded) drawTable();
});


// --- Drag and drop ---------------------------------------------------------
// A folder dragged onto the page arrives as a directory "entry" rather than a
// list of files, so it has to be walked by hand.

// Dropping anywhere else on the page would make the browser navigate away to
// the file, losing whatever is on screen. Swallow those.
window.addEventListener('dragover', function (event) { event.preventDefault(); });
window.addEventListener('drop', function (event) { event.preventDefault(); });

// dragenter and dragleave fire again every time the pointer crosses onto a
// child element, so a plain enter/leave pair flickers. Counting how deep we
// are means the look only changes when the pointer truly enters or leaves.
let dragDepth = 0;

dropZone.addEventListener('dragenter', function (event) {
  event.preventDefault();
  dragDepth++;
  // A question about a missing part is waiting for an answer. Merely moving the
  // pointer across the panel must not count as answering it: the old behavior
  // replaced the question with the dragover look and then, on leaving, with the
  // idle one, so the chosen files and the warning both vanished without a click.
  if (dropState === 'incomplete') return;
  showDropState('dragover');
  dzDragName.textContent = 'Let go to start';
});

// This one fires dozens of times a second while the pointer moves. It must do
// NOTHING except allow the drop. Touching the DOM here swaps elements out from
// under the cursor, which fires more drag events, which redraws again - that
// feedback loop is what made the panel strobe and what swallowed the drop.
dropZone.addEventListener('dragover', function (event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

dropZone.addEventListener('dragleave', function (event) {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dropState === 'incomplete') return;   // see dragenter
  if (dragDepth === 0) showDropState('idle');
});

dropZone.addEventListener('drop', async function (event) {
  event.preventDefault();
  event.stopPropagation();
  dragDepth = 0;

  // A run is already going. Ignore rather than start a second one on top of it.
  if (runInProgress) return;

  const entries = [];
  const items = event.dataTransfer.items || [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) {
    showRejected("That couldn't be read", 'Try one of the buttons instead.', '');
    return;
  }

  // Zips are what Google actually sends, so they are now the expected thing to
  // drop rather than a mistake to correct. Which of the dropped files are zips
  // is decided by reading the front of each one, never by its name. See
  // looksLikeZip().
  //
  // ZIPS AND LOOSE FILES TOGETHER IS NOT A MISTAKE. When a single video is
  // larger than the split size chosen at Takeout, Google cannot fit it inside a
  // part and ships it beside them as a bare file. Somebody selecting everything
  // Google gave them is doing exactly the right thing, so all of it is read.
  showDropState('idle');

  // Everything dropped is collected first, from inside folders as well as from
  // the top level, and only then sorted. Sorting only the top level would mean a
  // folder with the parts still sitting in it had its zips treated as photos and
  // copied into the output as junk, which is exactly the mistake the byte check
  // exists to prevent.
  const collected = [];
  for (const entry of entries) {
    if (entry.isFile) {
      collected.push(await new Promise(function (resolve, reject) { entry.file(resolve, reject); }));
    } else {
      await walkEntry(entry, '', collected);
    }
  }

  const sorted = await splitOutZips(collected);

  if (sorted.zips.length > 0) {
    openZips(sorted.zips, sorted.rest);
    return;
  }
  const looseFiles = sorted.rest;

  // A single file that is not a zip is the remaining common mistake.
  if (entries.length === 1 && entries[0].isFile) {
    showRejected(
      "That's a single file",
      'Drop the whole Takeout folder, or the .zip files Google sent you.',
      entries[0].name
    );
    return;
  }

  if (looseFiles.length === 0) {
    showRejected('That folder is empty', 'Pick the folder that has your photos in it.', '');
    return;
  }
  zipNotes = [];
  zipSourceNames = [];
  handleFolder(looseFiles);
});


/** Walks a dropped folder and collects every file inside it, at any depth. */
async function walkEntry(entry, prefix, out) {
  if (entry.isFile) {
    const file = await new Promise(function (resolve, reject) { entry.file(resolve, reject); });
    // Give the file the same folder path the picker would have given it, so
    // the rest of the app cannot tell the difference between drop and picker.
    try {
      Object.defineProperty(file, 'webkitRelativePath', { value: prefix + entry.name });
    } catch (e) { /* some browsers already set it; not worth stopping for */ }
    out.push(file);
    return;
  }

  if (entry.isDirectory) {
    const reader = entry.createReader();
    let batch;
    // readEntries hands back at most 100 entries at a time, so keep asking
    // until it returns an empty batch.
    do {
      batch = await new Promise(function (resolve, reject) { reader.readEntries(resolve, reject); });
      for (const child of batch) await walkEntry(child, prefix + entry.name + '/', out);
    } while (batch.length > 0);
  }
}


// --- Opening the zips Google sent, without unpacking them ------------------
//
// Google splits a library across numbered parts, and it splits them wherever
// the size limit falls rather than at any boundary that means something. A
// photo can therefore sit in part 3 while the .json holding its date sits in
// part 4. That is why the old instructions said to unpack every zip into one
// folder before starting: both halves had to end up in the same place.
//
// Reading the zips directly does the same joining-up, in memory, from the paths
// inside them. Every part uses the same folder names, so a photo and its
// sidecar land in the same folder here even when they arrived in different
// files. Nothing is written to any zip; they are opened read only.


/**
 * Google names the parts of one export with a number on the end, like
 * `takeout-20260818T090000Z-002.zip`. If the numbers that were dropped have a
 * gap in them, a part is missing, and any photo whose date lived in that part
 * will come out wrong. This is worth saying BEFORE the work starts.
 *
 * The check is deliberately quiet when it is not confident. Files that do not
 * follow the naming pattern are ignored rather than guessed about.
 */
function findMissingParts(zipFiles) {
  const groups = new Map();

  for (const file of zipFiles) {
    const match = /^(.*?)-(\d+)\.zip$/i.exec(file.name);
    if (!match) continue;
    const prefix = match[1];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(Number(match[2]));
  }

  const missing = [];
  for (const [, numbers] of groups) {
    // One part on its own says nothing: a single-part export is normal, and so
    // is deliberately doing one part at a time.
    if (numbers.length < 2) continue;
    const highest = Math.max.apply(null, numbers);
    const have = new Set(numbers);
    for (let n = 1; n <= highest; n++) if (!have.has(n)) missing.push(n);
  }

  return missing;
}


/**
 * Opens every zip that was dropped or chosen and hands the files inside them to
 * the same scanner a folder goes through.
 *
 * Only the index of each zip is read here, which is small however big the zip
 * is, so this stays quick even on a library of many gigabytes. No photo is
 * decompressed until the scan actually reaches it.
 */
/**
 * Asks about a gap in the part numbers BEFORE any reading starts.
 *
 * This is the whole point of noticing. Telling somebody at the end of a 50 GB
 * pass that part 3 was missing spends exactly the hour the warning exists to
 * save, and by then they have a library dated from half its metadata. The check
 * costs nothing: it reads the file NAMES, not the files.
 *
 * It asks rather than refuses. Two exports that overlap, or files somebody
 * renamed, look like a gap without being one, and it is their library.
 */
function askAboutMissingParts(missing, onContinue) {
  dzIncompleteBody.textContent =
    'Part ' + joinWithAnd(missing.map(String)) + ' of this export ' +
    verbBe(missing.length) + ' not among the files you chose. Google splits one ' +
    'library across numbered parts wherever the size limit falls, so a photo can ' +
    'be in one part while the date for it is in another. Adding the missing ' +
    plural(missing.length, 'one') + ' gives a better result than running this twice.';

  dzIncompleteHeadline.textContent =
    missing.length === 1 ? 'Part ' + missing[0] + ' looks missing' : 'Some parts look missing';

  pendingZipRun = onContinue;
  showDropState('incomplete');

  // Move focus onto the question. The control that was just used is now hidden,
  // so without this a keyboard user is left with focus nowhere and a screen
  // reader user is never told anything happened. Done after the state is shown,
  // because a hidden element cannot take focus.
  if (dzIncomplete) dzIncomplete.focus();
}


async function openZips(zipFiles, looseFiles) {
  // Asked first, on the names alone, so a wrong set costs a click and not an hour.
  const missingUpFront = findMissingParts(zipFiles);
  if (missingUpFront.length > 0 && !skipMissingPartsCheck) {
    askAboutMissingParts(missingUpFront, function () {
      skipMissingPartsCheck = true;
      openZips(zipFiles, looseFiles);
    });
    return;
  }
  skipMissingPartsCheck = false;

  beginWork(zipFiles.length === 1 ? 'Opening your zip' : 'Opening your zips');
  reportWork(0, zipFiles.length, '');
  await pause();

  const files = [];
  const seenPaths = new Set();
  const notes = [];
  const failed = [];
  let duplicates = 0;

  // Anything dropped alongside the zips goes in first, so that if the same path
  // also turns up inside a zip the loose copy is the one kept. Google only ships
  // a file loose because it would not fit in a part, so the loose one is the
  // whole file and any namesake inside a zip is not.
  for (const file of (looseFiles || [])) {
    const path = file.webkitRelativePath || file.name;
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);
    files.push(file);
  }

  for (let i = 0; i < zipFiles.length; i++) {
    // Stop has to work here too. Opening the zips is quick on a small export and
    // is not on a large one, and a Stop pressed during it used to be swallowed:
    // the button disabled itself, the loop ignored it, and the scan that
    // followed reset the flag, so the press vanished with nothing to show for it.
    if (stopRequested) {
      endWork();
      showPhase('idle');
      showDropState('idle');
      stopRequested = false;
      return;
    }

    const zipFile = zipFiles[i];
    reportWork(i, zipFiles.length, zipFile.name);
    await pause();

    let result;
    try {
      result = await TakeoutZip.readZip(zipFile);
    } catch (e) {
      failed.push({ name: zipFile.name, why: e && e.message ? e.message : String(e) });
      continue;
    }

    for (const file of result.files) {
      // The same path arriving twice means the same zip was chosen twice, or two
      // exports overlap. Keeping the first is right, and the count is reported
      // rather than swallowed.
      if (seenPaths.has(file.webkitRelativePath)) { duplicates++; continue; }
      seenPaths.add(file.webkitRelativePath);
      file.zipName = zipFile.name;
      files.push(file);
    }

    for (const problem of result.problems) notes.push(zipFile.name + ': ' + problem);
  }

  reportWork(zipFiles.length, zipFiles.length, '');

  // Every zip failed, so there is nothing to scan and the reason has to be the
  // whole message rather than a footnote under a results screen.
  if (files.length === 0) {
    endWork();
    showPhase('idle');
    // Two different things reach here and they need different words. Either the
    // archives would not open at all, or they opened perfectly and held nothing
    // this tool can use. Saying "couldn't be opened" for the second is a lie
    // that sends somebody off to re-download a file that is fine.
    if (failed.length === 0) {
      showRejected(
        zipFiles.length === 1 ? 'That zip opened, but there is nothing in it for this'
                              : 'Those zips opened, but there is nothing in them for this',
        (notes.length > 0 ? notes.join(' ') + ' ' : '') +
        'Check you picked the Google Photos export rather than another Takeout.',
        zipFiles.length === 1 ? zipFiles[0].name : ''
      );
      return;
    }
    const why = failed.length === 1
      ? failed[0].why
      : 'None of those files could be opened as a zip.';
    showRejected(
      failed.length === 1 && zipFiles.length === 1 ? "That zip couldn't be opened" : "Those couldn't be opened",
      why,
      failed.length === 1 ? failed[0].name : ''
    );
    return;
  }

  // Anything that went wrong on the way in is carried into the results screen,
  // because a partly-read set of zips must never look like a complete one.
  zipNotes = notes;
  for (const bad of failed) {
    zipNotes.push(bad.name + ' could not be opened, so nothing in it was read. ' + bad.why);
  }
  if (duplicates > 0) {
    zipNotes.push(
      formatCount(duplicates) + ' ' + plural(duplicates, 'file') +
      ' appeared in more than one zip and ' + verbBe(duplicates) + ' only counted once.'
    );
  }

  // Files handed over outside the zips are worth mentioning, but only the ones
  // that are genuinely loose. A whole unpacked folder dropped alongside the zips
  // also arrives this way, and it carries its own sidecars in its own folders,
  // so saying it has no date available would be untrue. The two are told apart
  // by whether the file has a folder path at all.
  const strays = (looseFiles || []).filter(function (f) {
    return (f.webkitRelativePath || '').indexOf('/') === -1;
  });
  if (strays.length > 0) {
    zipNotes.push(
      formatCount(strays.length) + ' ' + plural(strays.length, 'file') + ' ' +
      verbBe(strays.length) + ' handed over on ' + (strays.length === 1 ? 'its' : 'their') +
      ' own rather than inside a zip, and ' + (strays.length === 1 ? 'was' : 'were') +
      ' included. Google does that with a file too big for the split size you chose. ' +
      'A date for ' + (strays.length === 1 ? 'it' : 'them') + ' can only come from the ' +
      'file itself, because any .json for it sits inside a zip, in a folder ' +
      (strays.length === 1 ? 'this file is' : 'these files are') + ' not in.'
    );
  }

  const missing = findMissingParts(zipFiles);
  if (missing.length > 0) {
    zipNotes.push(
      'Part ' + joinWithAnd(missing.map(String)) + ' of this export ' +
      verbBe(missing.length) + ' not here. Google splits one library across ' +
      'numbered parts and a photo\'s date can be in a different part from the ' +
      'photo, so add the missing ' + plural(missing.length, 'one') + ' and run this again.'
    );
  }

  zipSourceNames = zipFiles.map(f => f.name);
  handleFolder(files);
}


/**
 * Is this actually a zip? Asked of the BYTES, never of the name.
 *
 * The rest of this tool has never trusted a file extension, because a real
 * export had seven files named .HEIC that were JPEGs inside. Routing a dropped
 * file by whether its name ends in .zip would have been the one place that rule
 * was broken, and it would break in both directions: an export somebody renamed
 * would be treated as a photo and quietly added to their library as junk, and a
 * folder of holiday snaps in a file called .zip would be opened as an archive.
 *
 * Every zip starts with the same two letters, after the initials of the man who
 * wrote the format. The four bytes cost one read of the front of the file.
 */
async function looksLikeZip(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (head.length < 4) return false;
    if (head[0] !== 0x50 || head[1] !== 0x4b) return false;      // "PK"
    // A normal archive starts with an entry; an empty one starts with its index.
    return (head[2] === 0x03 && head[3] === 0x04) ||
           (head[2] === 0x05 && head[3] === 0x06) ||
           (head[2] === 0x07 && head[3] === 0x08);
  } catch (e) {
    return false;   // unreadable is not a zip, and the caller will say so
  }
}


/** Sorts a dropped or chosen list into the zips and everything else. */
async function splitOutZips(files) {
  const zips = [];
  const rest = [];
  for (const file of files) {
    if (await looksLikeZip(file)) zips.push(file); else rest.push(file);
  }
  return { zips: zips, rest: rest };
}


// --- When this device should not start at all ------------------------------
//
// This check used to be about folders. Picking a whole folder is something
// phone browsers simply cannot do, and that alone ruled them out. Reading zips
// removes that reason, because a zip is one ordinary file and a phone can hand
// one over perfectly well. The conclusion did not change, but the reason did,
// and it is worth writing down which is which.
//
// The reason now is the WRITING side. Reading got cheap: only one photo is held
// at a time, whatever the export weighs. Building the repaired copy did not.
// That holds whole photos in memory while a new zip is assembled, and a phone
// browser is allowed a small fraction of a laptop's budget for exactly that
// kind of storage, so a real library dies partway through the download rather
// than at the start.
//
// What makes this awkward to detect is that iOS Safari and Chrome for Android
// both LIST the webkitdirectory property while still only ever offering single
// files, so asking whether the property exists gets a yes from browsers where
// the picker does not work. The property test is still worth doing - Firefox on
// Android, among others, is honest about it - but it cannot be the whole test.
//
// So there are two questions. Does the property exist, and is the only pointer
// on this device a finger? The second is a question about input hardware, asked
// through the standard media queries. The user agent string is never read.
//
// Getting this wrong in one direction shows an explanation to somebody who
// could have used the tool. Getting it wrong in the other direction lets
// somebody start something that cannot possibly finish, on their photo library.
// The explanation is by far the better of those two failures.

/** Can a folder actually be chosen in this browser? */
function folderPickerWorksHere() {
  if (!('webkitdirectory' in document.createElement('input'))) return false;

  // Coarse pointer, no hover, and real touch points: a phone or a tablet.
  const touchOnly =
    window.matchMedia('(pointer: coarse)').matches &&
    window.matchMedia('(hover: none)').matches &&
    (navigator.maxTouchPoints || 0) > 0;

  return !touchOnly;
}


// False once we have decided there is no folder picker here. Everything that
// would draw a control into the drop zone checks this first, so nothing
// clickable can come back afterwards.
let folderPickerAvailable = true;


/**
 * Replaces the drop zone with a plain explanation when a folder cannot be
 * chosen. Nothing that could be pressed is left behind - a disabled button
 * would just be an invitation to keep trying.
 */
function checkFolderPickerSupport() {
  if (folderPickerWorksHere()) return;

  folderPickerAvailable = false;

  dzIdle.hidden = true;
  dzDragover.hidden = true;
  dzRejected.hidden = true;
  dzNoPicker.hidden = false;
  dropZone.classList.add('is-unavailable');

  // The notice underneath explains how to choose a folder, which is advice for
  // something that cannot be done here.
  if (folderNotice) folderNotice.hidden = true;
}


// Which look the drop zone is currently wearing, so we never rewrite the DOM
// to the state it is already in.
let dropState = 'idle';

/** Switches the drop zone between its three looks. */
function showDropState(state) {
  if (!folderPickerAvailable) return;   // there is no drop zone to change
  if (state === dropState) return;
  dropState = state;
  dropZone.className = 'dropzone' +
    (state === 'dragover' ? ' is-dragover'
      : state === 'rejected' ? ' is-rejected'
      : state === 'incomplete' ? ' is-incomplete' : '');
  dzIdle.hidden = state !== 'idle';
  dzDragover.hidden = state !== 'dragover';
  dzRejected.hidden = state !== 'rejected';
  if (dzIncomplete) dzIncomplete.hidden = state !== 'incomplete';
}


/** Shows the "that won't work" state. The reassurance sentence is mandatory. */
function showRejected(headline, advice, filename) {
  dzRejectHeadline.textContent = headline;
  dzRejectBody.innerHTML = escapeHtml(advice) + " <strong>Your file wasn't changed.</strong>";
  dzRejectName.textContent = filename;
  showDropState('rejected');
}


/** Shows one of the three screens and hides the other two. */
function showPhase(name) {
  phaseIdle.hidden = name !== 'idle';
  phaseWorking.hidden = name !== 'working';
  phaseDone.hidden = name !== 'done';
}


/** Puts everything back to the first screen. */
function startOver() {
  // Belt and braces on the re-entry guard. endWork() clears it on every path
  // that finishes, and Start over is the one control always within reach, so
  // clearing it here means no imaginable stuck flag can lock somebody out.
  runInProgress = false;
  scannedRows = [];
  fileInventory = null;
  dateClusters = [];
  sidecarPaths = [];
  lastRunSummary = null;
  scanStopped = false;
  downloadButton.removeAttribute('aria-busy');
  tableExpanded = false;
  currentFilter = 'all';
  currentPage = 1;
  tableWrap.hidden = true;
  toggleTable.setAttribute('aria-expanded', 'false');
  progressLine.textContent = '';
  skippedBox.innerHTML = '';
  scanSummary.textContent = '';
  clusterNotice.innerHTML = '';
  zipNotes = [];
  zipSourceNames = [];
  pendingZipRun = null;
  skipMissingPartsCheck = false;
  picker.value = '';
  zipPicker.value = '';
  showDropState('idle');
  showPhase('idle');
}


// --- The wait --------------------------------------------------------------

// True from the moment a run starts until it finishes, whichever way it ends.
//
// The working screen is deliberately not revealed for the first 700 ms, so that
// a small library does not flash a progress panel nobody needed to see. That
// leaves the drop zone on screen and still live for those 700 ms, and a second
// drop landing in that window starts a parallel run that shares the tallies and
// the name set with the first. Set in beginWork and cleared in endWork, which
// between them bracket every run and every way one can end.
let runInProgress = false;

/** Starts the working screen and the clock that proves it is alive. */
function beginWork(heading) {
  runInProgress = true;
  stopRequested = false;
  stopButton.disabled = false;
  stopButton.textContent = 'Stop';
  workHeading.textContent = heading;
  workEta.textContent = '';
  workBar.style.width = '0%';
  tickerFile.textContent = ' ';
  startedAt = Date.now();
  workElapsed.textContent = '0 s elapsed';

  clearInterval(elapsedTimer);
  elapsedTimer = setInterval(function () {
    workElapsed.textContent = describeElapsed(Math.floor((Date.now() - startedAt) / 1000)) + ' elapsed';
  }, 1000);

  // How much progress you show depends on how long the job actually takes, and
  // a job under a second gets none at all. A small folder finishes in a few
  // hundred milliseconds, and throwing up a five-signal progress panel for that
  // long just makes the screen flash and leaves people wondering whether it did
  // anything. So the panel is armed here and only appears if the work is still
  // going when the timer fires.
  clearTimeout(workRevealTimer);
  workRevealTimer = setTimeout(function () { showPhase('working'); }, WORK_REVEAL_MS);
}


// Under this, the wait is not worth showing; over it, show everything.
const WORK_REVEAL_MS = 700;
let workRevealTimer = null;


/** Stops the clock, and cancels the progress panel if it never needed to appear. */
function endWork() {
  runInProgress = false;
  clearInterval(elapsedTimer);
  elapsedTimer = null;
  clearTimeout(workRevealTimer);
  workRevealTimer = null;
}


/** Updates the bar, the count, the ticker and the estimate. */
function reportWork(done, total, filename) {
  workCount.textContent = formatCount(done) + ' of ' + formatCount(total);
  workBar.style.width = (total > 0 ? Math.round((done / total) * 100) : 0) + '%';

  if (filename) {
    tickerFile.textContent = filename;
    retrigger(tickerFile);
  }

  // Coarse and honest, and never shown before there is enough to go on.
  // Always rounded DOWN, so the estimate cannot keep growing.
  if (done >= 30 && done < total) {
    const perFile = (Date.now() - startedAt) / done;
    workEta.textContent = 'about ' + describeRemaining((total - done) * perFile / 1000) + ' left';
  }
}


// The signature moment: a changed number fades up into place. Throttled to at
// most one visual tick per tile per 400ms, because without it a fast machine
// just flickers.
const TICK_THROTTLE_MS = 400;
const lastTickAt = { haveDate: 0, needDate: 0, noDate: 0 };

/** Sets one tally, and ticks it if it has been long enough since the last one. */
function setTally(name, value) {
  const box = tallyBoxes[name];
  if (!box) return;
  // A renamed key would otherwise quietly print "NaN" across the whole scan,
  // which reads as a crash to somebody watching their photo library go through.
  if (!Number.isFinite(value)) return;
  const changed = box.textContent !== formatCount(value);
  box.textContent = formatCount(value);

  const now = Date.now();
  if (changed && now - lastTickAt[name] >= TICK_THROTTLE_MS) {
    lastTickAt[name] = now;
    retrigger(box);
  }
}


/** Restarts a CSS animation on an element that is already on screen. */
function retrigger(element) {
  element.classList.remove('ticked');
  void element.offsetWidth;      // forces the browser to notice the removal
  element.classList.add('ticked');
}


/** "45 s" / "4 min 12 s" */
function describeElapsed(seconds) {
  if (seconds < 60) return seconds + ' s';
  return Math.floor(seconds / 60) + ' min ' + (seconds % 60) + ' s';
}


/** A deliberately vague estimate. Never "2:47". */
function describeRemaining(seconds) {
  if (seconds < 45) return 'less than a minute';
  const minutes = Math.floor(seconds / 60);
  if (minutes <= 1) return 'a minute';
  if (minutes < 60) return minutes + ' minutes';
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? 'an hour' : hours + ' hours';
}


// --- Reading the folder ----------------------------------------------------

/** Runs when a folder has been picked or dropped. */
async function handleFolder(files) {
  scannedRows = [];
  lastRunSummary = null;
  tableExpanded = false;
  tableWrap.hidden = true;
  toggleTable.setAttribute('aria-expanded', 'false');
  currentFilter = 'all';
  currentPage = 1;
  progressLine.textContent = '';
  skippedBox.innerHTML = '';
  dateClusters = [];
  clusterNotice.innerHTML = '';
  tally = { haveDate: 0, needDate: 0, noDate: 0 };

  beginWork('Reading your photos');
  setTally('haveDate', 0); setTally('needDate', 0); setTally('noDate', 0);
  reportWork(0, files.length, '');
  await pause();

  // Sort every file into media or sidecars, keeping track of which folder it is
  // in. Matching is done folder by folder, because Takeout albums often reuse
  // the same filenames.
  //
  // EVERY media file gets a row now, not just the JPEGs. A HEIC or a video is
  // never written to, but it still belongs in the download and it still needs
  // its file date put right, which is the thing most people are actually here
  // for.
  const media = [];
  const sidecarsByFolder = new Map();

  // Every single file gets counted, whatever it is, so nothing is quietly ignored.
  const counts = { JPEG: 0, HEIC: 0, PNG: 0, GIF: 0, WEBP: 0, RAW: 0, Video: 0, JSON: 0, other: 0 };
  sidecarPaths = [];

  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    const folder = folderOf(path);
    const bucket = bucketFor(file.name);
    counts[bucket]++;

    if (bucket === 'JSON') {
      sidecarPaths.push(path);
      if (!sidecarsByFolder.has(folder)) sidecarsByFolder.set(folder, []);
      sidecarsByFolder.get(folder).push(file);
    } else {
      media.push({ file, folder, path, bucket });
    }
  }

  fileInventory = { total: files.length, counts: counts, mediaCount: media.length };

  // Work out the match for every file, read the JSON for the ones that matched,
  // and read whatever the file itself already carries. This is the long part on
  // a real library.
  const rows = [];

  scanStopped = false;

  for (let i = 0; i < media.length; i++) {
    // Stopping mid-scan leaves a PARTIAL picture of the folder, and every number
    // on the results screen would otherwise describe it as if it were the whole
    // thing. Record it so the summary can say so.
    if (stopRequested) { scanStopped = { done: rows.length, total: media.length }; break; }

    const item = media[i];
    const folderSidecars = sidecarsByFolder.get(item.folder) || [];
    const matchName = findSidecarFor(item.file.name, folderSidecars.map(f => f.name));

    const row = {
      name: item.file.name,
      path: item.path,
      file: item.file,           // kept so the download button can read it later
      bucket: item.bucket,
      isJpeg: item.bucket === 'JPEG',
      sidecarName: matchName,
      data: null,
      existing: null,            // the date and GPS the file already carries
      error: null
    };

    if (matchName) {
      const sidecarFile = folderSidecars.find(f => f.name === matchName);
      try {
        const text = await sidecarFile.text();
        row.data = readSidecarData(JSON.parse(text));
      } catch (e) {
        row.error = 'Could not read this JSON file';
      }
    }

    // Read what the file ALREADY has, before anything is written, so the table
    // can say plainly which files genuinely need this tool and which are fine.
    row.existing = await readExistingMetadata(item.file, item.bucket);

    rows.push(row);

    // Keep the tallies honest as we go.
    if (row.existing && row.existing.hasDate) tally.haveDate++;
    else if (row.data && row.data.timestamp) tally.needDate++;
    else tally.noDate++;
    setTally('haveDate', tally.haveDate);
    setTally('needDate', tally.needDate);
    setTally('noDate', tally.noDate);

    // Hand control back to the browser often enough that the page keeps
    // redrawing, but not so often that the scan crawls.
    if (i % 25 === 0 || i === media.length - 1) {
      reportWork(i + 1, media.length, item.path);
      await pause();
    }
  }

  endWork();
  scannedRows = rows;
  linkLivePhotoPartners();
  findDateClusters();
  showResults();
}


// --- The answer ------------------------------------------------------------

/** Draws the results screen. */
function showResults() {
  drawZipNotice();
  drawTiles();
  drawScanSummary();
  drawResultsNotices();

  // Every media file goes into the download, correctly dated, whether or not we
  // write anything inside it. The label says how many files, not how many were
  // "fixed", because on a normal library those are very different numbers.
  const count = scannedRows.length;
  downloadLabel.textContent = count === 1
    ? 'Download 1 file, correctly dated'
    : 'Download ' + formatCount(count) + ' files, correctly dated';
  downloadButton.disabled = count === 0;
  downloadButton.removeAttribute('aria-busy');

  // The preview report is worth having even when nothing can be fixed - that is
  // exactly when a list of what was found and why is most useful.
  previewReportButton.disabled = false;

  // The results report describes a run, so until a run has happened there is
  // nothing for it to describe. Grayed out rather than hidden, so it is visible
  // that a record will exist afterwards.
  resultsReportButton.disabled = !lastRunSummary;

  toggleTableLabel.textContent = (tableExpanded ? 'Hide all ' : 'Show all ') +
    formatCount(allTableRows().length) + ' files';
  drawChips();
  if (tableExpanded) drawTable();

  showPhase('done');
}


/**
 * The three tiles.
 *
 * These used to be "Fixed / Can't be fixed / No metadata", which was built on
 * the belief that Takeout strips your dates out. It does not. So the three
 * numbers worth showing are now: how many files come out correctly dated (all
 * of them), how many actually need anything written inside them (usually very
 * few), and how many have no date to be found anywhere (the honest failure).
 */
function drawTiles() {
  const total = scannedRows.length;
  const pct = n => (total > 0 ? Math.round((n / total) * 100) : 0);

  // Nothing is written until the download button is pressed, so before that the
  // tiles must not claim anything has happened yet.
  const written = Boolean(lastRunSummary);

  const noDate = scannedRows.filter(row => dateSourceFor(row) === 'none').length;

  // After a run these must come from what the run ACTUALLY did, not from
  // re-deriving the plan - otherwise the past-tense labels claim work that a
  // failure or a Stop meant never happened.
  const toWrite = written
    ? lastRunSummary.fixedCount
    : scannedRows.filter(needsWriting).length;
  const dated = written
    ? lastRunSummary.fixedCount + lastRunSummary.unchangedCount
    : total - noDate;

  const tiles = [
    { kind: 'success', icon: 'success',
      label: written ? 'Correctly dated' : 'Will be dated correctly',
      count: dated,
      desc: written
        ? 'files in your download carrying their real date'
        : 'files that will come out of the zip with the right date on them' },
    { kind: 'notice', icon: 'notice',
      label: written ? 'Written into' : 'Need writing into',
      count: toWrite,
      desc: describeWhatNeedsWriting(toWrite) },
    { kind: 'warning', icon: 'warning', label: 'No date anywhere', count: noDate,
      desc: 'nothing inside the file and nothing in a sidecar either' }
  ];

  tilesBox.innerHTML = tiles.map(function (t) {
    return '<div class="tile tile-' + t.kind + '">' +
      '<p class="tile-head">' + iconSvg(t.icon) + escapeHtml(t.label) + '</p>' +
      '<p class="tile-count">' + formatCount(t.count) + '</p>' +
      '<p class="tile-desc">' + escapeHtml(t.desc) + '</p>' +
      '<div class="tile-bar"><div class="tile-bar-fill" style="width:' + pct(t.count) + '%"></div></div>' +
      '<p class="tile-pct">' + pct(t.count) + '% of your files</p>' +
      '</div>';
  }).join('');
}


/** The middle tile's line. Says nothing needs doing when nothing does. */
function describeWhatNeedsWriting(count) {
  if (count === 0) return 'nothing here needs its metadata changed';
  return 'JPEGs missing a date or a location, filled in from the sidecar';
}


/**
 * Counts what the scan actually found. This answers the only question worth
 * asking before pressing Download: how much of this needs doing at all?
 *
 * On a normal phone-and-camera library the answer is "almost none of it", and
 * saying so plainly is more useful than a big number that implies otherwise.
 */
function countWhatNeedsDoing() {
  const counts = {
    jpegs: 0,
    jpegsWithDate: 0,
    jpegsMissingDate: 0,
    gpsOnlyInSidecar: 0,
    unreadable: 0,
    otherByBucket: {},
    otherTotal: 0
  };

  for (const row of scannedRows) {
    const existing = row.existing;

    if (!row.isJpeg) {
      counts.otherByBucket[row.bucket] = (counts.otherByBucket[row.bucket] || 0) + 1;
      counts.otherTotal++;
      continue;
    }

    counts.jpegs++;
    if (existing && existing.checked && !existing.known) counts.unreadable++;

    if (existing && existing.hasDate) counts.jpegsWithDate++;
    else counts.jpegsMissingDate++;

    // A location that is in the sidecar but not in the photo. This is the other
    // thing only Google's JSON knows: locations added or corrected inside
    // Google Photos are never written back into the file.
    const sidecarHasGps = Boolean(row.data && row.data.latitude !== null);
    if (sidecarHasGps && !(existing && existing.hasGps)) counts.gpsOnlyInSidecar++;
  }

  return counts;
}


/** "7 HEIC, 1 RAW and 12 video" - the files we never write into, named. */
function describeReadOnlyFiles(counts) {
  const words = { HEIC: 'HEIC', RAW: 'RAW', Video: 'video', PNG: 'PNG',
                  GIF: 'GIF', WEBP: 'WebP', other: 'other' };
  const parts = [];

  for (const bucket of READ_ONLY_BUCKETS) {
    const n = counts.otherByBucket[bucket];
    if (n > 0) parts.push(formatCount(n) + ' ' + words[bucket]);
  }

  return joinWithAnd(parts);
}


/**
 * The summary sentence above the table, and the most important thing on this
 * screen. It is what stops somebody believing 847 photos were broken when 812
 * of them were always fine.
 *
 * It is redrawn when the "only write what is missing" box is toggled, because
 * that box changes what happens to the photos that are already fine.
 */
function drawScanSummary() {
  if (!scanSummary) return;

  if (scannedRows.length === 0) {
    scanSummary.textContent = '';
    return;
  }

  const n = countWhatNeedsDoing();
  const onlyMissing = onlyMissingBox.checked;
  const sentences = [];

  // Said first, because it changes what every number after it means.
  if (scanStopped) {
    sentences.push('Stopped after reading ' + formatCount(scanStopped.done) + ' of ' +
      formatCount(scanStopped.total) + ' files, so everything below describes only ' +
      'that part of the folder. Start over to read the rest.');
  }

  if (n.jpegs > 0) {
    sentences.push(formatCount(n.jpegs) + ' ' + plural(n.jpegs, 'JPEG') + '.');

    // The headline fact: most photos came out of Takeout with their date intact.
    if (n.jpegsWithDate > 0) {
      sentences.push(formatCount(n.jpegsWithDate) + ' already ' + verbHave(n.jpegsWithDate) +
        ' their date' +
        (onlyMissing
          ? ' and will not be changed.'
          : ", and Google's sidecar date will be written over it."));
    }

    if (n.jpegsMissingDate > 0) {
      sentences.push(formatCount(n.jpegsMissingDate) + ' ' + verbBe(n.jpegsMissingDate) +
        ' missing one.');
    }
  }

  // The files we never write into. They are still in the download and still get
  // their file date put right, which is the point worth making here.
  if (n.otherTotal > 0) {
    sentences.push(describeReadOnlyFiles(n) + ' ' + plural(n.otherTotal, 'file') +
      ' will get correct file dates but ' +
      (n.otherTotal === 1 ? "won't" : "won't") + ' be modified.');
  }

  if (n.gpsOnlyInSidecar > 0) {
    sentences.push(formatCount(n.gpsOnlyInSidecar) + ' ' + verbHave(n.gpsOnlyInSidecar) +
      ' a location Google stored separately.');
  }

  if (n.unreadable > 0) {
    sentences.push(formatCount(n.unreadable) + " couldn't be read, so " +
      (n.unreadable === 1 ? 'it is' : 'they are') + ' treated as missing.');
  }

  scanSummary.textContent = sentences.join(' ');
  drawClusterNotice();
}


/**
 * The upload-batch warning. This is the most defensible thing the tool says, so
 * it is a notice on the screen, not a footnote.
 */
function drawClusterNotice() {
  if (!clusterNotice) return;

  const googleDated = scannedRows.filter(row => dateSourceFor(row) === 'google').length;

  if (googleDated === 0) {
    clusterNotice.innerHTML = '';
    return;
  }

  // "No date inside it" is only true for the files we actually opened. A video's
  // dates live in its container and this tool does not read those, so the wording
  // has to cover both without claiming something it did not check.
  let body = 'For ' + formatCount(googleDated) + ' ' + plural(googleDated, 'file') +
    ", the only date available is Google's record of when the photo entered your " +
    'library, which may not be when it was taken.';

  // The clustering is the evidence. Where it exists, say it plainly.
  if (dateClusters.length > 0) {
    const biggest = dateClusters.reduce((a, b) => (b.count > a.count ? b : a));
    body += ' ' + formatCount(biggest.count) + ' of them share timestamps spanning ' +
      describeSpan(biggest.spanSeconds) + ' in total' +
      (dateClusters.length > 1 ? ', in one of ' + dateClusters.length + ' such groups' : '') +
      '. Photos taken at different times do not arrive a few seconds apart, so that is ' +
      'one upload, not ' + formatCount(biggest.count) + ' separate moments.';
  }

  body += googleDatesBox.checked
    ? ' You have chosen to write these dates in anyway.'
    : ' These dates are NOT being written into the photos. The files still get the date ' +
      'on the outside, so they sort sensibly, and what is inside them is left honest.';

  clusterNotice.innerHTML =
    '<div class="notice notice-warning">' + iconSvg('warning', 'notice-icon') +
    '<div><p class="notice-label">Where ' + formatCount(googleDated) +
    ' of these dates came from</p>' +
    '<p class="notice-body">' + escapeHtml(body) + '</p></div></div>';
}


/**
 * Anything that went wrong opening the zips, said above the numbers.
 *
 * This sits at the top of the results on purpose. A missing part of an export
 * produces a scan that looks completely healthy while describing only some of a
 * library, and that is the one failure here capable of quietly losing somebody's
 * dates. It has to be impossible to miss and it has to say what to do.
 */
function drawZipNotice() {
  if (!zipNotice) return;

  const notes = zipNotes.slice();

  // A file with no date of its own and no sidecar falls back to the date stored
  // beside it in the zip, and that is the moment Google packed the archive, not
  // a capture time. Measured on two real exports: 91 entries carrying 4 distinct
  // timestamps, and 121 carrying 5 within a minute of each other. It is the same
  // pattern as an upload batch, so it gets said out loud the same way rather than
  // being allowed to look like a date somebody's camera recorded.
  if (zipSourceNames.length > 0) {
    const undated = scannedRows.filter(row => dateSourceFor(row) === 'none').length;
    if (undated > 0) {
      notes.push(
        formatCount(undated) + ' ' + plural(undated, 'file') + ' had no date inside ' +
        (undated === 1 ? 'it' : 'them') + ' and no sidecar, so the only date left is when ' +
        'Google packed the export. That is not when the photo was taken, it is not written ' +
        'into the file, and ' + (undated === 1 ? 'it is' : 'they are') + ' counted under ' +
        '"No date anywhere" above.'
      );
    }
  }

  if (notes.length === 0) {
    zipNotice.innerHTML = '';
    return;
  }

  const items = notes.map(note => '<li>' + escapeHtml(note) + '</li>').join('');

  zipNotice.innerHTML =
    '<div class="notice notice-warning">' + iconSvg('warning', 'notice-icon') +
    '<div><p class="notice-label">' +
    (notes.length === 1 ? 'One thing about the zips you gave this' : 'Some things about the zips you gave this') +
    '</p><ul class="notice-body notice-list">' + items + '</ul>' +
    '<p class="notice-body">Everything below describes only what was actually read. ' +
    'Your zips were not changed.</p></div></div>';
}


/** "1 photo has" but "12 photos have". */
function verbHave(count) { return count === 1 ? 'has' : 'have'; }

/** "1 photo is" but "12 photos are". */
function verbBe(count) { return count === 1 ? 'is' : 'are'; }


/**
 * The notice under the tiles. A notice names the fact and then says what
 * happens to the user's files: "can't be fixed" on its own is frightening,
 * "left exactly as they are" is the half that takes the fear away.
 */
function drawResultsNotices() {
  const n = countWhatNeedsDoing();
  const counts = fileInventory ? fileInventory.counts : {};

  if (n.otherTotal === 0 && !counts.JSON) { resultsNotices.innerHTML = ''; return; }

  const parts = [];

  if (n.otherTotal > 0) {
    parts.push(describeReadOnlyFiles(n) + ' ' + plural(n.otherTotal, 'file') +
      ' are in your download with the right date on them, but nothing inside them is ' +
      'touched. Measuring a real export showed HEIC, RAW and video come out of Takeout ' +
      'with their dates and locations already intact, so there is nothing there to repair.');
  }

  if (counts.JSON > 0) {
    parts.push('The ' + formatCount(counts.JSON) + ' JSON metadata ' + plural(counts.JSON, 'file') +
      ' are read for what your photos are missing. They are not photos, so they are not ' +
      'in the download.');
  }

  resultsNotices.innerHTML =
    '<div class="notice">' + iconSvg('notice', 'notice-icon') +
    '<div><p class="notice-label">Good to know</p>' +
    '<p class="notice-body">' + escapeHtml(parts.join(' ')) + '</p></div></div>';
}


// --- The table -------------------------------------------------------------

/**
 * Every file, in one list, with the status it ended up with.
 *   ownDate    - the date was already inside the file. Nothing needed doing.
 *   googleDate - the only date is Google's record of when it arrived.
 *   willWrite  - we are filling something in from the sidecar.
 *   noDate     - no date inside the file and none in a sidecar either.
 */
function allTableRows() {
  return scannedRows.map(function (row) {
    const source = dateSourceFor(row);

    // "Filling in" wins over the others, so the chip counts and the tile above
    // them can never disagree about how many files are being written to. Where
    // the date came from is still shown, in its own column, on every row.
    let status;
    if (needsWriting(row)) status = 'willWrite';
    else if (source === 'none') status = 'noDate';
    else if (source === 'google') status = 'googleDate';
    else status = 'ownDate';

    return { status: status, path: row.path, row: row };
  });
}


const STATUS_WORDS = {
  ownDate:    { word: 'Already dated', icon: 'success', cls: 'row-fixed' },
  willWrite:  { word: 'Filling in', icon: 'success', cls: 'row-fixed' },
  googleDate: { word: "Google's record", icon: 'warning', cls: 'row-nometa' },
  noDate:     { word: 'No date anywhere', icon: 'error', cls: 'row-unmatched' }
};


/** The filter chips. Each one carries its own icon, not just its color. */
function drawChips() {
  const all = allTableRows();
  const counts = {
    all: all.length,
    ownDate: all.filter(r => r.status === 'ownDate').length,
    willWrite: all.filter(r => r.status === 'willWrite').length,
    googleDate: all.filter(r => r.status === 'googleDate').length,
    noDate: all.filter(r => r.status === 'noDate').length
  };

  const chips = [
    { key: 'all', label: 'All', icon: null },
    { key: 'ownDate', label: 'Already dated', icon: 'success' },
    { key: 'willWrite', label: 'Filling in', icon: 'success' },
    { key: 'googleDate', label: "Google's record", icon: 'warning' },
    { key: 'noDate', label: 'No date anywhere', icon: 'error' }
  ];

  chipsBox.innerHTML = chips.map(function (c) {
    return '<button type="button" class="chip" data-filter="' + c.key + '" ' +
      'aria-pressed="' + (currentFilter === c.key) + '">' +
      (c.icon ? iconSvg(c.icon) : '') + escapeHtml(c.label) +
      ' <span class="chip-count">' + formatCount(counts[c.key]) + '</span></button>';
  }).join('');

  chipsBox.querySelectorAll('.chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      currentFilter = chip.getAttribute('data-filter');
      currentPage = 1;
      drawChips();
      drawTable();
    });
  });
}


/** Rows matching whichever chip is pressed. */
function filteredRows() {
  const all = allTableRows();
  if (currentFilter === 'all') return all;
  return all.filter(r => r.status === currentFilter);
}


/** Draws one page of the table. */
function drawTable() {
  const rows = filteredRows();
  const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  if (currentPage > pages) currentPage = pages;

  const start = (currentPage - 1) * ROWS_PER_PAGE;
  const slice = rows.slice(start, start + ROWS_PER_PAGE);

  tableBody.innerHTML = slice.map(tableRowHtml).join('');
  drawPager(rows.length, pages);
}


/** One row. Never leaves a cell blank - an empty cell reads as a bug. */
function tableRowHtml(entry) {
  const meta = STATUS_WORDS[entry.status];
  const row = entry.row;
  const source = dateSourceFor(row);

  // Where the date came from is the most important thing in the row, so it gets
  // its own column and its own wording. "Google's record" and "from the photo"
  // are very different claims and must never look the same.
  const sourceCell = source === 'photo'
    ? '<span class="src-photo">' +
      (row.partnerClock ? 'from ' + escapeHtml(row.partnerName) : 'from the photo') + '</span>'
    : source === 'google'
      ? '<span class="src-google">Google\'s record' +
        (row.inCluster ? ' <span class="src-batch">upload batch</span>' : '') + '</span>'
      : '<span class="empty">none</span>';

  const found = source === 'photo'
    ? escapeHtml(formatExistingDate(row.existing.clock || row.partnerClock))
    : source === 'google'
      ? escapeHtml(formatFoundDate(row.data))
      : '<span class="empty">none found</span>';

  return '<tr class="' + meta.cls + (row.inCluster ? ' row-batch' : '') + '">' +
    '<td class="cell-wrap-status"><span class="cell-status">' +
      iconSvg(meta.icon) + escapeHtml(meta.word) + '</span></td>' +
    '<td><span class="cell-file" title="' + escapeHtml(entry.path) + '">' +
      escapeHtml(entry.path) + '</span></td>' +
    '<td class="col-yesno" data-label="Already has date">' + yesNoCell(row, 'hasDate') + '</td>' +
    '<td class="col-yesno" data-label="Already has GPS">' + yesNoCell(row, 'hasGps') + '</td>' +
    '<td class="col-source" data-label="Date source">' + sourceCell + '</td>' +
    '<td class="col-date col-date-found" data-label="Date found">' + found + '</td>' +
    '<td class="col-date" data-label="Written inside">' +
      escapeHtml(describePlannedWrite(row)) + '</td>' +
    '</tr>';
}


/**
 * One of the two "already has it?" cells.
 *
 * Four answers, not two: yes, no, "couldn't read", and "not checked". A file we
 * failed to read is not a file without a date, and a video was never opened at
 * all - saying "no" for either would be inventing a fact.
 */
function yesNoCell(row, field) {
  if (!row || !row.existing) return '<span class="empty">n/a</span>';
  if (!row.existing.checked) return '<span class="empty">not checked</span>';
  if (!row.existing.known) return '<span class="empty">couldn\'t read</span>';
  return row.existing[field] ? 'yes' : '<span class="empty">no</span>';
}


/** A date read out of the file itself, shown plainly. It has no timezone on it. */
function formatExistingDate(clock) {
  if (!clock) return 'none';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return pad(clock.day, 2) + ' ' + months[clock.month - 1] + ' ' + clock.year +
    ', ' + pad(clock.hour, 2) + ':' + pad(clock.minute, 2);
}


/**
 * What this run will actually put INSIDE one file. Most rows say "nothing",
 * and that is the point of the column: on a normal library this tool barely
 * touches anything, and it should say so file by file.
 */
function describePlannedWrite(row) {
  const plan = writePlanFor(row);

  if (plan.writeDate && plan.writeGps) {
    return formatDate(row.data.timestamp, row.data.timezone) + ' + location';
  }
  if (plan.writeDate) return formatDate(row.data.timestamp, row.data.timezone);
  if (plan.writeGps) return 'location only';

  if (!row.isJpeg) return 'nothing - file date only';
  if (dateSourceFor(row) === 'google') return "nothing - Google's date not written";
  return 'nothing - already has what it needs';
}


/** The pager. 50 rows a page: a paged list has an end, an endless one does not. */
function drawPager(totalRows, pages) {
  if (pages <= 1) {
    pagerBox.innerHTML = '<span>' + formatCount(totalRows) + ' ' + plural(totalRows, 'file') + '</span>';
    return;
  }

  const first = (currentPage - 1) * ROWS_PER_PAGE + 1;
  const last = Math.min(currentPage * ROWS_PER_PAGE, totalRows);

  pagerBox.innerHTML =
    '<button type="button" class="page-btn" id="prevPage"' +
      (currentPage === 1 ? ' disabled' : '') + '>Previous</button>' +
    '<span>' + formatCount(first) + ' to ' + formatCount(last) +
      ' of ' + formatCount(totalRows) + '</span>' +
    '<button type="button" class="page-btn" id="nextPage"' +
      (currentPage === pages ? ' disabled' : '') + '>Next</button>';

  const prev = document.getElementById('prevPage');
  const next = document.getElementById('nextPage');
  if (prev) prev.addEventListener('click', function () { currentPage--; drawTable(); });
  if (next) next.addEventListener('click', function () { currentPage++; drawTable(); });
}


// --- The eight icons -------------------------------------------------------
// Inline SVG only: no icon font, no sprite sheet, no request of any kind. The
// set is closed at eight, because a ninth icon means a ninth meaning, and a
// new meaning needs a new word before it needs a picture.
//
// The shapes are deliberately different from each other, not just differently
// colored: notice is the only square, warning the only triangle, and info,
// success and error are circles that differ in what is inside them. They stay
// apart with every drop of color removed.

const ICON_PATHS = {
  success:  '<circle cx="8" cy="8" r="6.25"/><path d="m5.25 8.25 1.9 1.9 3.6-4.1"/>',
  error:    '<circle cx="8" cy="8" r="6.25"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"/>',
  warning:  '<path d="M8 2.2 14.4 13.3H1.6Z"/><path d="M8 6.4v3.1"/><path d="M8 11.5h.01"/>',
  notice:   '<rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2.5"/><path d="M5 6.25h6M5 9.25h4"/>',
  info:     '<circle cx="8" cy="8" r="6.25"/><path d="M8 7.2v4"/><path d="M8 4.9h.01"/>',
  folder:   '<path d="M1.75 4.75A1.5 1.5 0 0 1 3.25 3.25h2.4l1.3 1.6h5.8a1.5 1.5 0 0 1 1.5 1.5v6.4H1.75Z"/>',
  download: '<path d="M8 2v8"/><path d="M4.5 7 8 10.5 11.5 7"/><path d="M2.5 13h11"/>',
  progress: '<circle cx="8" cy="8" r="6.25" class="arc-track"/><path d="M8 1.75A6.25 6.25 0 0 1 14.25 8"/>'
};

/** Builds one icon. Always sits next to a word, never on its own. */
function iconSvg(name, extraClass) {
  const paths = ICON_PATHS[name];
  if (!paths) return '';
  return '<svg class="icon ' + (extraClass || '') + '" viewBox="0 0 16 16" fill="none" ' +
    'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
}


// --- Sorting files into types ----------------------------------------------

const FILE_BUCKETS = [
  { label: 'JPEG',  extensions: ['.jpg', '.jpeg'] },
  { label: 'HEIC',  extensions: ['.heic', '.heif'] },
  { label: 'PNG',   extensions: ['.png'] },
  { label: 'GIF',   extensions: ['.gif'] },
  { label: 'WEBP',  extensions: ['.webp'] },
  // RAW files are TIFF underneath, whatever the camera maker calls them.
  { label: 'RAW',   extensions: ['.dng', '.cr2', '.cr3', '.nef', '.arw', '.raf',
                                 '.orf', '.rw2', '.srw', '.pef'] },
  { label: 'Video', extensions: ['.mp4', '.mov', '.m4v', '.3gp', '.avi', '.mkv',
                                 '.mpg', '.mpeg', '.mts', '.webm'] },
  { label: 'JSON',  extensions: ['.json'] }
];

// The buckets we never write into. They still go into the download, and they
// still get their file date put right - that costs nothing and is most of the
// value for most people. We simply do not touch what is inside them.
const READ_ONLY_BUCKETS = ['HEIC', 'PNG', 'GIF', 'WEBP', 'RAW', 'Video', 'other'];

// Everything except the JSON sidecars is a file the user wants back.
function isMediaBucket(bucket) { return bucket !== 'JSON'; }


/**
 * The folder part of a path, or "" when the file has no folder at all.
 *
 * This has to be spelled out rather than done with slice(0, lastIndexOf('/')),
 * because lastIndexOf returns -1 when there is no slash, and slice(0, -1) then
 * quietly chops the LAST CHARACTER off instead of giving back an empty string.
 * That put every loose file in a folder of its own - "IMG_1.jpg" in "IMG_1.jp"
 * and its sidecar in "IMG_1.jpg.supplemental-metadata.jso" - so no photo ever
 * shared a folder with its own sidecar and nothing could ever match.
 *
 * It only showed up when files were picked individually instead of as a folder,
 * because a folder pick always puts a slash in the path.
 */
function folderOf(path) {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? '' : path.slice(0, cut);
}


/** Works out which bucket one filename belongs to. Anything unknown is "other". */
function bucketFor(filename) {
  const lower = filename.toLowerCase();
  for (const bucket of FILE_BUCKETS) {
    for (const extension of bucket.extensions) {
      if (lower.endsWith(extension)) return bucket.label;
    }
  }
  return 'other';
}


// --- Small helpers ---------------------------------------------------------

/** Puts thousands separators into a number, so 1247 is shown as 1,247. */
function formatCount(number) {
  return Number(number).toLocaleString('en-GB');
}

/** "1 file" but "2 files". */
function plural(count, word) {
  return count === 1 ? word : word + 's';
}

/** Joins a list the way English does: "a", "a and b", or "a, b, and c". */
function joinWithAnd(parts) {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] + ' and ' + parts[1];
  return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
}


/**
 * The date exactly as Google stored it: UTC, untouched. This is the "before"
 * column, so it is deliberately NOT converted.
 */
function formatFoundDate(data) {
  if (!data || !data.timestamp) return 'none found';
  return new Date(data.timestamp * 1000).toLocaleString('en-GB', {
    timeZone: 'UTC', hourCycle: 'h23',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }) + ' UTC';
}


/**
 * Turns a Unix timestamp into readable text, showing the time as the clock read
 * at the place the photo was taken. This is exactly what gets written into the
 * photo, so what you see in the table is what you will get.
 *
 * With GPS:    "02 Aug 2026, 15:23:05  Europe/London (UTC+01:00)"
 * Without GPS: "02 Aug 2026, 14:23:05  UTC (no GPS)"
 */
function formatDate(seconds, timezone) {
  if (!seconds) return 'no date';

  const date = new Date(seconds * 1000);

  const text = date.toLocaleString('en-GB', {
    timeZone: timezone || 'UTC',
    hourCycle: 'h23',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  if (!timezone) return text + ' UTC (no GPS)';

  const offset = formatOffset(timezoneOffsetMinutes(seconds, timezone));
  return text + ' (UTC' + offset + ')';
}


/** Turns a location into readable text, e.g. "51.5074, -0.1278 (35 m)". */
function formatGps(data) {
  let text = data.latitude.toFixed(6) + ', ' + data.longitude.toFixed(6);
  if (data.altitude !== null && data.altitude !== 0) {
    text += ' (' + Math.round(data.altitude) + ' m)';
  }
  return text;
}


/** Makes text safe to drop into the page, in case a filename contains < or &. */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


/** Gives the browser a moment to redraw the screen. */
function pause() {
  return new Promise(resolve => setTimeout(resolve, 0));
}


// ---------------------------------------------------------------------------
// PART 4 - TURNING SIDECAR INFORMATION INTO EXIF TAGS
//
// This is the part that actually writes the date and location into the photo.
// ---------------------------------------------------------------------------

/**
 * Formats a Unix timestamp the way EXIF insists on: "YYYY:MM:DD HH:MM:SS".
 * Note the COLONS in the date part. Dashes are wrong and photo apps will ignore them.
 *
 * TIMEZONE: the old date tags have nowhere to record a timezone, so the time written
 * here is the plain wall clock time of the place the photo was taken, worked out from
 * its GPS position. Photos with no GPS get UTC. This computer's clock is not involved.
 */
function formatExifDateTime(unixSeconds, timezone) {
  const clock = wallClockIn(unixSeconds, timezone);

  const datePart = pad(clock.year, 4) + ':' + pad(clock.month, 2) + ':' + pad(clock.day, 2);
  const timePart = pad(clock.hour, 2) + ':' + pad(clock.minute, 2) + ':' + pad(clock.second, 2);

  return datePart + ' ' + timePart;
}


// Newer EXIF versions DO have a place to record the timezone, in tags called
// OffsetTime. The copy of piexif in vendor/ predates them and does not know their
// numbers, so we introduce them here. This changes nothing else about piexif and
// leaves the vendored file untouched.
const OFFSET_TIME = 36880;            // goes with DateTime
const OFFSET_TIME_ORIGINAL = 36881;   // goes with DateTimeOriginal
const OFFSET_TIME_DIGITIZED = 36882;  // goes with DateTimeDigitized

piexif.TAGS['Exif'][OFFSET_TIME] = { 'name': 'OffsetTime', 'type': 'Ascii' };
piexif.TAGS['Exif'][OFFSET_TIME_ORIGINAL] = { 'name': 'OffsetTimeOriginal', 'type': 'Ascii' };
piexif.TAGS['Exif'][OFFSET_TIME_DIGITIZED] = { 'name': 'OffsetTimeDigitized', 'type': 'Ascii' };


/**
 * Writes our date and GPS tags into a set of EXIF sections.
 * Kept in one place because it is needed twice: once for the normal case, and once
 * for the emergency "write only our tags" fallback further down.
 *
 * The plan says which of the two the photo actually needs. A photo that already
 * had a perfectly good date keeps it, and only its missing location is filled
 * in - see writePlanFor().
 */
function applyDateAndGpsTags(exifObj, data, plan) {
  if (plan.writeDate && data.timestamp) {
    const stamp = formatExifDateTime(data.timestamp, data.timezone);
    exifObj['Exif'][piexif.ExifIFD.DateTimeOriginal] = stamp;   // when the photo was taken
    exifObj['Exif'][piexif.ExifIFD.DateTimeDigitized] = stamp;  // when it became a file
    exifObj['0th'][piexif.ImageIFD.DateTime] = stamp;           // general "date" field

    // Record which timezone that reading belongs to, so apps that understand these
    // newer tags can work out the true moment again instead of guessing.
    // With no GPS the times above are UTC, so the honest offset is +00:00.
    const offset = data.timezone
      ? formatOffset(timezoneOffsetMinutes(data.timestamp, data.timezone))
      : '+00:00';
    exifObj['Exif'][OFFSET_TIME_ORIGINAL] = offset;
    exifObj['Exif'][OFFSET_TIME_DIGITIZED] = offset;
    exifObj['Exif'][OFFSET_TIME] = offset;
  }

  if (plan.writeGps && data.latitude !== null && data.longitude !== null) {
    exifObj['GPS'][piexif.GPSIFD.GPSLatitudeRef] = data.latitude >= 0 ? 'N' : 'S';
    exifObj['GPS'][piexif.GPSIFD.GPSLatitude] = decimalToDms(data.latitude);
    exifObj['GPS'][piexif.GPSIFD.GPSLongitudeRef] = data.longitude >= 0 ? 'E' : 'W';
    exifObj['GPS'][piexif.GPSIFD.GPSLongitude] = decimalToDms(data.longitude);
  }
}


/** Pads a number with leading zeros, e.g. pad(7, 2) gives "07". */
function pad(number, width) {
  return String(number).padStart(width, '0');
}


/**
 * EXIF does not store GPS as a plain decimal like 51.5074. It stores degrees,
 * minutes and seconds, and each of those is a pair of whole numbers meaning
 * "top divided by bottom".
 *
 * So 51.5074 becomes 51 degrees, 30 minutes, 26.64 seconds, written as:
 *   [[51, 1], [30, 1], [26640, 1000]]
 *
 * The sign is dropped here. Which side of the equator or meridian you are on is
 * recorded separately in the "Ref" tags as N/S and E/W.
 */
function decimalToDms(decimal) {
  const absolute = Math.abs(decimal);

  let degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  let minutes = Math.floor(minutesFloat);
  // Seconds are kept to three decimal places, which is far more precise than any phone.
  let seconds = Math.round((minutesFloat - minutes) * 60 * 1000);

  // Rounding can push seconds up to a full minute (or minutes to a full degree).
  // Carry the extra over so we never write something like "60 seconds".
  if (seconds >= 60000) { seconds -= 60000; minutes += 1; }
  if (minutes >= 60) { minutes -= 60; degrees += 1; }

  return [[degrees, 1], [minutes, 1], [seconds, 1000]];
}


/**
 * Takes one JPEG (as a binary string) plus the date and GPS we read from the sidecar,
 * and returns a NEW JPEG binary string with those details written into its EXIF.
 * The original file on disk is never touched.
 */
function writeExifIntoJpeg(jpegBinary, data, plan, existingClock) {
  // Read whatever EXIF the photo already has, so we keep camera model, exposure and
  // everything else. If the photo has no EXIF at all we start from an empty set.
  let exifObj;
  try {
    exifObj = piexif.load(jpegBinary);
  } catch (e) {
    exifObj = emptyExif();
  }

  // Make sure the sections we are about to write into exist.
  if (!exifObj['0th']) exifObj['0th'] = {};
  if (!exifObj['Exif']) exifObj['Exif'] = {};
  if (!exifObj['GPS']) exifObj['GPS'] = {};

  // The date tags, the timezone offset tags, and the location.
  applyDateAndGpsTags(exifObj, data, plan);

  // Turn the tags back into raw EXIF bytes, then put them into the JPEG.
  return piexif.insert(dumpExifSafely(exifObj, data, plan, existingClock), jpegBinary);
}


/** An EXIF set with nothing in it, in the shape piexif expects. */
function emptyExif() {
  return { '0th': {}, 'Exif': {}, 'GPS': {}, 'Interop': {}, '1st': {}, 'thumbnail': null };
}


/**
 * Converts the tags back to raw bytes. Some photos in the wild contain odd tags that
 * piexif refuses to write back out, so there are two fallbacks. The point is that a
 * strange photo still gets its date, rather than being skipped entirely.
 */
function dumpExifSafely(exifObj, data, plan, existingClock) {
  // Attempt 1: write everything, keeping all the photo's original tags.
  try {
    return piexif.dump(exifObj);
  } catch (e) { /* fall through */ }

  // Attempt 2: the embedded thumbnail is the usual troublemaker. Drop it and retry.
  try {
    const withoutThumb = Object.assign({}, exifObj);
    delete withoutThumb['thumbnail'];
    withoutThumb['1st'] = {};
    return piexif.dump(withoutThumb);
  } catch (e) { /* fall through */ }

  // Attempt 3: give up on the original tags and write ONLY our date and location.
  // The photo loses its old EXIF, but it gets the correct date, which is the point.
  const minimal = emptyExif();
  applyDateAndGpsTags(minimal, data, plan);

  // This path throws the photo's original tags away, so if we were only adding a
  // location, carry its own date across by hand. Otherwise adding GPS to a photo
  // would silently cost it the capture date it already had - the exact damage
  // this tool exists to undo.
  if (!plan.writeDate && existingClock) {
    const stamp =
      pad(existingClock.year, 4) + ':' + pad(existingClock.month, 2) + ':' +
      pad(existingClock.day, 2) + ' ' + pad(existingClock.hour, 2) + ':' +
      pad(existingClock.minute, 2) + ':' + pad(existingClock.second, 2);
    minimal['Exif'][piexif.ExifIFD.DateTimeOriginal] = stamp;
    minimal['Exif'][piexif.ExifIFD.DateTimeDigitized] = stamp;
    minimal['0th'][piexif.ImageIFD.DateTime] = stamp;
  }

  return piexif.dump(minimal);
}


// piexif works with "binary strings", where each character stands for one byte.
// These two helpers convert between that and the raw bytes a file actually gives us.

/** Raw file bytes -> binary string. Done in chunks so big photos don't overflow. */
function bytesToBinaryString(bytes) {
  const CHUNK = 0x8000;
  let out = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return out;
}

/** Binary string -> raw bytes, ready to put in the zip. */
function binaryStringToBytes(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}


// ---------------------------------------------------------------------------
// PART 5 - THE DOWNLOAD BUTTON
// ---------------------------------------------------------------------------

/**
 * Works out what, if anything, should be written INSIDE one file.
 *
 * Note this is only about the file's own metadata. Every file goes into the
 * download and every file gets its date put right whatever this returns - see
 * zipEntryDateFor().
 *
 * ONLY JPEGs ARE EVER WRITTEN TO. HEIC, RAW and video are copied through
 * untouched. Measuring a real export showed they come out of Takeout with their
 * dates and locations already intact, so there is nothing to repair and no
 * reason to risk rewriting them.
 *
 * WITH "ONLY WHAT IS MISSING" TICKED - the default - only gaps get filled. A
 * photo that came out of Takeout with its own DateTimeOriginal keeps it.
 * Overwriting a camera's own reading with Google's is a change nobody asked for.
 *
 * WITH IT CLEARED, whatever the sidecar says wins. That is what you want if you
 * corrected a date or a place inside Google Photos, because those edits were
 * never written back into the file.
 *
 * AND SEPARATELY: a date that exists only in the sidecar is Google's record of
 * when the photo arrived, not when it was taken. That has its own box, off by
 * default, because writing a guess into DateTimeOriginal makes it look like a
 * recovered fact forever afterwards.
 */
function writePlanFor(row) {
  // The gate is what the file REALLY is, not what it is called. A ".jpg" that
  // is a PNG inside is routine on Windows, and trying to splice an EXIF segment
  // into it would fail - so it is copied through instead, like any other file
  // we do not write to.
  if (!row.isJpeg || !row.existing || row.existing.format !== 'jpeg') {
    return { writeDate: false, writeGps: false };
  }

  const sidecarHasDate = Boolean(row.data && row.data.timestamp);
  const sidecarHasGps = Boolean(row.data && row.data.latitude !== null);
  const alreadyHasDate = Boolean(row.existing && row.existing.hasDate);
  const alreadyHasGps = Boolean(row.existing && row.existing.hasGps);

  let writeDate, writeGps;

  if (onlyMissingBox.checked) {
    writeDate = sidecarHasDate && !alreadyHasDate;
    writeGps = sidecarHasGps && !alreadyHasGps;
  } else {
    writeDate = sidecarHasDate;
    writeGps = sidecarHasGps;
  }

  // The date is only Google's guess when the photo had none of its own. If the
  // photo has a date and you have asked for the sidecar to overwrite it, that is
  // a correction you made in Google Photos, and it is trustworthy.
  if (dateSourceFor(row) === 'google' && !googleDatesBox.checked) writeDate = false;

  return { writeDate: writeDate, writeGps: writeGps };
}


/** Is there anything at all to write inside this file? */
function needsWriting(row) {
  const plan = writePlanFor(row);
  return plan.writeDate || plan.writeGps;
}


// HOW BIG ONE BATCH IS ALLOWED TO GET.
// Writing EXIF turns each photo into text, which takes roughly two and a half times
// its own size in memory, and the zip holds every photo until it is finished. Doing
// a whole library in one go therefore crashes the tab. So photos are done in batches,
// and each batch becomes its own zip file that is downloaded and then thrown away.
// A batch is closed as soon as EITHER of these is reached.
const CHUNK_MAX_IMAGES = 200;
const CHUNK_MAX_BYTES = 400 * 1024 * 1024;   // 400 MB of original photos


/**
 * Splits the photos into batches, each small enough to zip up safely.
 * Returns a list of lists: one inner list per zip file that will be produced.
 */
function planChunks(rows) {
  const chunks = [];
  let current = [];
  let bytesSoFar = 0;

  for (const row of rows) {
    const size = row.file.size || 0;

    // Close the current batch if this photo would push it past either limit. The
    // "is not empty" check means one gigantic photo still gets a batch to itself
    // rather than an empty batch being created in front of it.
    const tooMany = current.length >= CHUNK_MAX_IMAGES;
    const tooBig = bytesSoFar + size > CHUNK_MAX_BYTES;
    if (current.length > 0 && (tooMany || tooBig)) {
      chunks.push(current);
      current = [];
      bytesSoFar = 0;
    }

    current.push(row);
    bytesSoFar += size;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}


/** The filename for one batch's zip. A single batch gets no part number. */
function zipNameFor(chunkIndex, chunkCount) {
  if (chunkCount === 1) return 'takeout-fixed.zip';
  return 'takeout-fixed-part-' + pad(chunkIndex + 1, 2) + '.zip';
}


/** The "Zip 2 of 7 - " bit in front of the progress line. Empty if there is only one. */
function chunkLabel(chunkIndex, chunkCount) {
  if (chunkCount === 1) return '';
  return 'Zip ' + (chunkIndex + 1) + ' of ' + chunkCount + ' - ';
}


/** Waits for a set number of milliseconds. Used to space the downloads out a little. */
function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}


/**
 * The "date modified" to stamp on one photo inside the zip.
 *
 * THIS IS THE FIX FOR THE SYMPTOM PEOPLE ACTUALLY SEE. Unzipping stamps every file
 * with the moment it was extracted, so a fresh Takeout looks in Finder and Explorer
 * as though the whole library was shot today. That is a file system date, not EXIF,
 * and it is a separate problem from anything inside the photo. Giving each zip entry
 * the real capture date means the photo comes out of the zip already reading right,
 * whether or not we touched a single byte of its EXIF.
 *
 * THIS APPLIES TO EVERY FILE, including the ones we never write into. A HEIC, a
 * RAW file and a video all come out of the zip correctly dated even though not one
 * byte inside them is touched. That costs nothing and is most of the value for most
 * people.
 *
 * THE ORDER IS:
 *   1. the file's own DateTimeOriginal, if it has one - this is the trustworthy one
 *   2. the sidecar's photoTakenTime, if the file has no date inside it
 *   3. the file's own modified date, if there is neither. Never "now".
 *
 * The one wrinkle: if we are about to write the sidecar's date INTO the photo, the
 * file has to say the same thing as the photo will, so that case jumps the queue.
 * With the boxes at their defaults this is exactly the 1-2-3 order above. Finder
 * disagreeing with the photo it is describing would be a new version of the bug
 * this tool exists to fix.
 */
function zipEntryDateFor(row) {
  const plan = writePlanFor(row);

  if (plan.writeDate && row.data && row.data.timestamp) {
    return zipClockDate(wallClockIn(row.data.timestamp, row.data.timezone));
  }

  if (row.existing && row.existing.clock) {
    return zipClockDate(row.existing.clock);
  }

  // The other half of a Live Photo. See linkLivePhotoPartners().
  if (row.partnerClock) {
    return zipClockDate(row.partnerClock);
  }

  if (row.data && row.data.timestamp) {
    return zipClockDate(wallClockIn(row.data.timestamp, row.data.timezone));
  }

  return zipDateFor(new Date(row.file.lastModified));
}


/**
 * Hands JSZip one clock reading.
 *
 * A zip records "date modified" as a bare clock reading - "14th of July, 15:23" -
 * with no timezone on it at all, and JSZip fills that reading in from the UTC side of
 * whatever Date it is given. Whatever unzips the file reads it back as LOCAL time.
 *
 * So to make a photo come out of the zip reading 15:23, the Date we hand over has to
 * have 15:23 on its UTC side, which is exactly what Date.UTC builds. The reading we
 * use is the same one we write into the photo's EXIF, so the date Finder shows and
 * the date inside the photo agree. Neither field carries a timezone; making the two
 * bare readings match each other is the whole point.
 */
function zipClockDate(clock) {
  // A zip cannot record a year before 1980 - the format has no room for it - and
  // stops at 2107. Rather than let an out-of-range year wrap round to a nonsense
  // date, pin it to the nearest end and let the EXIF inside the photo carry the
  // true one. Scans of old family photos are the case that hits this.
  const year = Math.min(Math.max(clock.year, 1980), 2107);

  return new Date(Date.UTC(
    year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second
  ));
}


/**
 * Turns a real moment - "now", or a file's own modified date - into the reading
 * JSZip should store for it.
 *
 * Same quirk as above, approached from the other end: this one starts from an
 * instant rather than a clock reading, so it winds the clock back by this computer's
 * distance from UTC to leave the local reading on the Date's UTC side.
 *
 * This is the ONE place the computer's own timezone is the right thing to use, and
 * it never touches a photo's capture date. "Date modified" on a file with no capture
 * date at all means "when this file was written, on this computer", so the
 * computer's clock is exactly the right answer.
 */
function zipDateFor(moment) {
  // A file with a broken or missing modified date must not become a far-future
  // zip entry, so this goes through the same 1980-2107 clamp as everything else.
  if (!moment || !Number.isFinite(moment.getTime())) moment = new Date();

  const shifted = new Date(moment.getTime() - moment.getTimezoneOffset() * 60000);

  return zipClockDate({
    year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(), hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(), second: shifted.getUTCSeconds()
  });
}


/**
 * Runs when the button is clicked: dates everything, writes EXIF where it is
 * genuinely missing, zips it all up and downloads it.
 *
 * EVERY media file goes in - HEIC, RAW and video included. They are copied
 * through untouched, but they get the right date on the outside, which is the
 * thing that was broken for all of them.
 */
async function fixPhotos() {
  const todo = scannedRows;
  if (todo.length === 0) return;

  // Work out how many zip files this is going to take before starting anything.
  const chunks = planChunks(todo);

  // More than one zip means more than one download, and browsers ask about that.
  // Say so up front, and let the user back out.
  if (chunks.length > 1) {
    const goAhead = confirm(
      'This will download ' + chunks.length + ' separate zip files. Your browser may ' +
      'ask permission to download multiple files - please allow it.'
    );
    if (!goAhead) return;
  }

  skippedBox.innerHTML = '';
  progressLine.textContent = '';

  // One run at a time. Without this a second click part-way through starts a
  // parallel run that shares usedNames and the tallies, and the two interleave.
  if (downloadButton.getAttribute('aria-busy') === 'true') return;
  downloadButton.disabled = true;
  downloadButton.setAttribute('aria-busy', 'true');

  // Back to the waiting screen. Writing and zipping is the second long stretch,
  // and it deserves the same five signs of life as the first one.
  beginWork('Dating your files');
  reportWork(0, todo.length, '');

  const skipped = [];      // files we could not read at all - the only ones left out
  const notWritten = [];   // files that ARE in the zip, but we could not write inside
  const renamed = [];      // files renamed because two folders used the same name
  const usedNames = new Set();
  let fixedCount = 0;       // photos we wrote new EXIF into
  let unchangedCount = 0;   // photos that already had everything, copied through
  let zipsMade = 0;
  let doneCount = 0;    // photos finished so far, counted across ALL the batches

  for (let c = 0; c < chunks.length; c++) {

    // A brand new, empty zip for each batch.
    let zip = new JSZip();
    let filesInThisZip = 0;

    for (const row of chunks[c]) {
      if (stopRequested) break;
      doneCount++;

      // Update the counter every file, and hand control back to the browser every few
      // files so the page keeps redrawing instead of looking frozen. The count runs
      // straight through from the first photo to the last, across all the batches.
      reportWork(doneCount, todo.length, row.path);
      if (doneCount % 5 === 0) await pause();

      try {
        const plan = writePlanFor(row);
        let willWrite = plan.writeDate || plan.writeGps;

        // Read the file, and write new EXIF into it only if it is a JPEG that is
        // actually missing something. Everything else - a photo that already has
        // its date, and every HEIC, RAW file and video - goes into the zip byte
        // for byte as Takeout produced it.
        const bytes = new Uint8Array(await row.file.arrayBuffer());
        let payload = bytes;

        if (willWrite) {
          try {
            payload = binaryStringToBytes(writeExifIntoJpeg(
              bytesToBinaryString(bytes), row.data, plan,
              row.existing ? row.existing.clock : null));
          } catch (e) {
            // FAILING TO IMPROVE A FILE MUST NEVER COST YOU THE FILE. An odd
            // JPEG that piexif refuses to rewrite still goes into the download,
            // untouched, with its date on the outside put right. Losing it
            // would be a far worse outcome than not filling in its metadata.
            payload = bytes;
            willWrite = false;
            notWritten.push({ name: row.path,
                              reason: e && e.message ? e.message : String(e) });
          }
        }

        const nameInZip = makeUniqueName(row.name, usedNames);
        if (nameInZip !== row.name) renamed.push(row.path + ' -> ' + nameInZip);

        // Stamp the entry with the file's own capture date, so it comes out of the
        // zip already reading correctly in Finder and Explorer instead of showing
        // the moment it was extracted. See zipEntryDateFor above.
        zip.file(nameInZip, payload, { date: zipEntryDateFor(row) });
        filesInThisZip++;

        if (willWrite) fixedCount++; else unchangedCount++;

        // Remember how this one went, so the report can say so later.
        row.runStatus = willWrite ? 'fixed' : 'unchanged';
        row.runError = null;
      } catch (e) {
        // Only a failure to READ the file gets this far, and that is the one
        // case where there is genuinely nothing to put in the zip.
        const reason = e && e.message ? e.message : String(e);
        skipped.push({ name: row.path, reason: reason });
        row.runStatus = 'error';
        row.runError = reason;
      }

      // The Stop button promises to keep what has already been done, so the
      // batch that is part-built still gets zipped and downloaded below.
      stopButton.textContent = 'Stop - keep the ' +
        formatCount(fixedCount + unchangedCount) + ' already done';
    }

    // Every photo in this batch failed, so there is no zip worth building.
    if (filesInThisZip === 0) {
      zip = null;
      await pause();
      continue;
    }

    // Squeeze this batch into a zip file. This also takes a while, so keep the
    // ticker talking rather than letting the screen go quiet.
    workHeading.textContent = 'Building ' + zipNameFor(c, chunks.length);
    tickerFile.textContent = 'Packing ' + formatCount(filesInThisZip) + ' photos...';
    await pause();

    let blob = await zip.generateAsync(
      { type: 'blob', compression: 'STORE' },   // photos are already compressed
      function (status) {
        tickerFile.textContent = 'Packing ' + formatCount(filesInThisZip) +
          ' photos... ' + Math.round(status.percent) + '%';
      }
    );

    workHeading.textContent = 'Fixing your photos';

    // Let go of every photo in this batch BEFORE the next batch starts. This is the
    // whole point of doing it in batches: without these two lines the browser would
    // still be holding on to everything and would eventually run out of memory.
    zip = null;

    downloadBlob(blob, zipNameFor(c, chunks.length));
    blob = null;
    zipsMade++;

    // Give the browser a moment to start the download and tidy up after itself
    // before we start filling memory up again.
    if (c < chunks.length - 1 && !stopRequested) {
      tickerFile.textContent = 'Download started. Clearing memory before the next batch...';
      await wait(1500);
    }

    // Stop was pressed. Everything zipped so far has already been downloaded,
    // which is exactly what the button promised.
    if (stopRequested) break;
  }

  endWork();

  const packed = fixedCount + unchangedCount;

  if (packed === 0) {
    progressLine.textContent = 'Nothing could be packed. See the list below.';
  } else {
    // Two numbers, not one. Saying "fixed 65" when 55 of them were already
    // correct and only had their file date restored would be the same overclaim
    // this whole screen exists to stop.
    progressLine.textContent =
      (stopRequested ? 'Stopped. Kept ' : 'Done. ') + formatCount(packed) +
      ' files in ' + zipsMade + ' zip ' + plural(zipsMade, 'file') + ', all carrying ' +
      'their real date' +
      (fixedCount > 0 ? '. ' + formatCount(fixedCount) + ' had metadata written in' : '') +
      (unchangedCount > 0
        ? (fixedCount > 0 ? ' and ' : '. ') + formatCount(unchangedCount) +
          ' were copied through untouched'
        : '') +
      (skipped.length > 0 ? '. Skipped ' + skipped.length : '') +
      '. Your ' + plural(zipsMade, 'download') + ' should have started.';
  }

  drawSkipped(skipped, renamed, notWritten);

  // Remember what happened, and let the report be downloaded now there is something
  // real to put in it.
  lastRunSummary = {
    fixedCount: fixedCount,
    unchangedCount: unchangedCount,
    skippedCount: skipped.length,
    zipCount: zipsMade
  };
  showResults();
}


/**
 * Keeps filenames unique inside the zip. Two different Takeout folders can both
 * contain "IMG_1234.jpg", and without this the second one would silently replace
 * the first. The second copy becomes "IMG_1234-2.jpg".
 */
function makeUniqueName(name, usedNames) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }

  const parts = splitFilename(name);
  const counter = parts.counter ? '(' + parts.counter + ')' : '';

  let n = 2;
  let candidate;
  do {
    candidate = parts.base + counter + '-' + n + parts.extension;
    n++;
  } while (usedNames.has(candidate));

  usedNames.add(candidate);
  return candidate;
}


/** Lists any files that were skipped or renamed, under the progress line. */
function drawSkipped(skipped, renamed, notWritten) {
  let html = '';

  // In the zip, just not improved. Kept separate from "skipped" because the two
  // mean very different things to somebody checking their library is all there.
  if (notWritten && notWritten.length > 0) {
    html += '<p class="skipped-title">These are in your download with the right date, ' +
            'but their metadata could not be written:</p><ul class="skipped-list">';
    html += notWritten.map(function (item) {
      return '<li>' + escapeHtml(item.name) + ' <span class="reason">' +
             escapeHtml(item.reason) + '</span></li>';
    }).join('');
    html += '</ul>';
  }

  if (skipped.length > 0) {
    html += '<p class="skipped-title">These files could not be read at all and are not in the zip:</p><ul class="skipped-list">';
    html += skipped.map(function (item) {
      return '<li>' + escapeHtml(item.name) + ' <span class="reason">' + escapeHtml(item.reason) + '</span></li>';
    }).join('');
    html += '</ul>';
  }

  if (renamed.length > 0) {
    html += '<p class="skipped-title">These had the same filename as another photo, so they were renamed inside the zip:</p><ul class="skipped-list">';
    html += renamed.map(function (line) {
      return '<li>' + escapeHtml(line) + '</li>';
    }).join('');
    html += '</ul>';
  }

  skippedBox.innerHTML = html;
}


// ---------------------------------------------------------------------------
// PART 6 - THE REPORTS
//
// Two plain .csv files, openable in any spreadsheet, one line per file found.
// They answer two different questions and must never be confused for each other,
// because one of them talks about photos that have not been touched yet:
//
//   preview - what is here and what WILL be written. Available as soon as the
//             folder has been read, and it says the same thing before and after
//             the download.
//   results - what a run actually DID write. Only exists once a run has run.
//
// Which one you are holding is written into the filename, the title line and the
// Stage line, so a file found on disk months later can still be identified.
// ---------------------------------------------------------------------------

/** Builds one of the two reports and asks the browser to save it. */
function downloadReport(stage) {
  const rows = buildReportRows(stage);
  const csv = buildReportCsv(rows, stage);

  // The odd character at the very front is a "byte order mark". It tells spreadsheet
  // programs that the file is UTF-8, so accented filenames come out looking right.
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, stage === 'preview'
    ? 'takeout-fixer-preview-report.csv'
    : 'takeout-fixer-results-report.csv');
}


/**
 * One entry per file: the photos first, then everything that was left out.
 *
 * The stage decides which question is being answered, and the two answers stay
 * different for the life of the page:
 *   'preview' - what is in this folder and what WILL be written. It ignores any
 *               run that has happened, so it says the same thing before and
 *               after the download.
 *   'results' - what a run actually DID write.
 */
function buildReportRows(stage) {
  const rows = [];

  for (const row of scannedRows) {
    rows.push(reportRowForPhoto(row, stage));
  }

  // The JSON sidecars. They are read for their dates and locations but are not
  // photos, so nothing is written to them and they are not in the download.
  for (const path of sidecarPaths) {
    rows.push({
      filename: path,
      status: 'unsupported-type',
      sidecar: '',
      hadDate: '',
      hadGps: '',
      dateSource: '',
      uploadBatch: '',
      fileDate: '',
      date: '',
      gps: '',
      error: 'JSON metadata file - read for what the photos are missing, not a photo'
    });
  }

  return rows;
}


/** Works out what to say about one photo, for the stage being reported on. */
function reportRowForPhoto(row, stage) {
  const entry = {
    filename: row.path,
    status: '',
    sidecar: row.sidecarName || '',
    // What the photo already carried, read before anything was written. These
    // two columns are the ones that show how little usually needed doing.
    hadDate: describeAlreadyHad(row, 'hasDate'),
    hadGps: describeAlreadyHad(row, 'hasGps'),
    // Where the date on this file came from. The single most important column
    // in the report: "google" means a date nobody has confirmed is the truth.
    dateSource: dateSourceFor(row),
    uploadBatch: row.inCluster ? 'yes' : '',
    fileDate: describeZipDate(row),
    date: '',
    gps: '',
    error: ''
  };

  // Not a JPEG. It goes into the download, correctly dated, and nothing inside
  // it is touched.
  if (!row.isJpeg) {
    entry.status = 'copied-through';
    entry.error = row.bucket + ' file - copied through untouched, file date set from ' +
                  (entry.dateSource === 'photo' ? 'its own metadata' :
                   entry.dateSource === 'google' ? "Google's record" : 'its original file date');
    return entry;
  }

  // A sidecar was found but could not be read.
  if (row.error) {
    entry.status = 'skipped-error';
    entry.error = row.error;
    return entry;
  }

  // The preview report answers "what will happen", so it never looks at the run
  // at all. It fills in the date and location that ARE going to be written,
  // which is the whole point of checking before committing to a big download.
  if (stage === 'preview') {
    const plan = writePlanFor(row);

    // Nothing is missing, so nothing goes in. Saying "ready to fix" here would
    // be the overclaim this pass exists to remove.
    if (!plan.writeDate && !plan.writeGps) {
      entry.status = entry.dateSource === 'none' ? 'no-date-anywhere' : 'already-complete';
      entry.error = entry.dateSource === 'google'
        ? "The only date is Google's record of when this photo entered the library. " +
          'It is not being written into the photo.'
        : entry.dateSource === 'none'
          ? 'No date inside the file and none in a sidecar either.'
          : 'Already has what it needs. Nothing is written into it; its file date is set.';
      return entry;
    }

    entry.status = 'ready-to-fix';
    if (plan.writeDate) entry.date = describeWrittenDate(row.data);
    if (plan.writeGps) entry.gps = describeWrittenGps(row.data);
    return entry;
  }

  // The results report answers "what happened". The run stamps each row as it
  // goes, so a row with no stamp on it simply has not been through the run.
  //
  // This must never be reported as an error. A report taken before the download
  // button is pressed would otherwise accuse the tool of skipping 42 photos
  // that are perfectly fine and were never asked to be written yet - which is
  // exactly the wrong thing to tell somebody worried about their photos.
  if (row.runStatus === 'fixed') {
    const plan = writePlanFor(row);
    entry.status = 'fixed';
    if (plan.writeDate) entry.date = describeWrittenDate(row.data);
    if (plan.writeGps) entry.gps = describeWrittenGps(row.data);
    return entry;
  }

  // In the zip, but nothing was written inside it. Its file date was set and
  // that was all it needed.
  if (row.runStatus === 'unchanged') {
    entry.status = entry.dateSource === 'none' ? 'no-date-anywhere' : 'already-complete';
    entry.error = entry.dateSource === 'google'
      ? "The only date was Google's record of when this photo entered the library. " +
        'It was not written into the photo.'
      : entry.dateSource === 'none'
        ? 'No date inside the file and none in a sidecar either.'
        : 'Already had what it needed. Nothing was written into it; its file date was set.';
    return entry;
  }

  if (row.runStatus === 'error') {
    entry.status = 'skipped-error';
    entry.error = row.runError || 'This photo could not be written';
    return entry;
  }

  // No stamp at all. Say which of the two harmless reasons it is, and leave the
  // date and GPS columns empty, because nothing has been written to this photo.
  entry.status = 'ready-to-fix';
  entry.error = lastRunSummary
    ? 'Not reached - the run was stopped before this photo. Nothing was written to it.'
    : 'Ready to fix. The download has not been run yet, so nothing has been written.';
  return entry;
}


/**
 * "yes", "no" or "couldn't read" for one of the two "already had it" columns.
 * A photo we failed to read is not a photo without a date, so it never says no.
 */
function describeAlreadyHad(row, field) {
  if (!row.existing) return '';
  if (!row.existing.checked) return 'not checked';
  if (!row.existing.known) return "couldn't read";
  return row.existing[field] ? 'yes' : 'no';
}


/** The date this file will carry on the OUTSIDE, as Finder will show it. */
function describeZipDate(row) {
  const date = zipEntryDateFor(row);
  return date.getUTCFullYear() + ':' + pad(date.getUTCMonth() + 1, 2) + ':' +
         pad(date.getUTCDate(), 2) + ' ' + pad(date.getUTCHours(), 2) + ':' +
         pad(date.getUTCMinutes(), 2) + ':' + pad(date.getUTCSeconds(), 2);
}


/** The date exactly as it was written into the photo, plus the timezone it belongs to. */
function describeWrittenDate(data) {
  if (!data.timestamp) return '';

  const stamp = formatExifDateTime(data.timestamp, data.timezone);
  const offset = data.timezone
    ? formatOffset(timezoneOffsetMinutes(data.timestamp, data.timezone))
    : '+00:00';

  return stamp + ' ' + offset + ' ' + (data.timezone || 'UTC (no GPS)');
}


/** The location exactly as it was written into the photo. */
function describeWrittenGps(data) {
  if (data.latitude === null || data.longitude === null) return '';
  return data.latitude.toFixed(6) + ', ' + data.longitude.toFixed(6);
}


/** Puts the header block, the column names and every row together into CSV text. */
function buildReportCsv(rows, stage) {
  const isPreview = stage === 'preview';

  // Add up how many files ended up in each state. Counted from whatever the
  // rows actually say, so a new status can never quietly total to NaN.
  const totals = {};
  for (const row of rows) totals[row.status] = (totals[row.status] || 0) + 1;
  const n = key => totals[key] || 0;

  const lines = [];

  // A short header block, so the file makes sense on its own months from now.
  // The first two lines exist to stop these two reports being mistaken for each
  // other, since one of them describes photos that have not been touched.
  lines.push(csvRow([isPreview
    ? 'Takeout Fixer - PREVIEW report (what will be written)'
    : 'Takeout Fixer - RESULTS report (what was written)']));
  lines.push(csvRow(['Stage', isPreview
    ? 'Before the download. NOTHING has been written to any photo. This lists what ' +
      'was found in the folder and the date this tool will write into each one.'
    : 'After the download. "fixed" means the new date is in the photo inside the zip.']));
  lines.push(csvRow(['Generated', new Date().toLocaleString('en-GB')]));

  lines.push(csvRow(['Files found', fileInventory ? fileInventory.total : rows.length]));
  lines.push(csvRow(['JPEGs found', fileInventory ? fileInventory.counts.JPEG : '']));
  if (isPreview) {
    lines.push(csvRow(['JPEGs that need something written', n('ready-to-fix')]));
    lines.push(csvRow(['JPEGs that already have what they need', n('already-complete')]));
  } else {
    lines.push(csvRow(['JPEGs written into', n('fixed')]));
    lines.push(csvRow(['JPEGs already complete, copied through untouched', n('already-complete')]));
    lines.push(csvRow(['Files not reached (run stopped early)', n('ready-to-fix')]));
  }
  lines.push(csvRow(['Files copied through untouched (HEIC, RAW, video)', n('copied-through')]));
  lines.push(csvRow(['Files with no date anywhere', n('no-date-anywhere')]));
  lines.push(csvRow(['Files skipped because of an error', n('skipped-error')]));
  lines.push(csvRow(['JSON sidecars read (not photos, not in the download)',
                     n('unsupported-type')]));

  // The provenance summary. This is the number that matters most in this file.
  const googleDated = scannedRows.filter(r => dateSourceFor(r) === 'google').length;
  lines.push(csvRow(["Dates that are Google's record, not the photo's own", googleDated]));
  if (dateClusters.length > 0) {
    const biggest = dateClusters.reduce((a, b) => (b.count > a.count ? b : a));
    lines.push(csvRow(['Upload-batch warning',
      formatCount(biggest.count) + ' of those share timestamps spanning ' +
      describeSpan(biggest.spanSeconds) + '. That is one upload, not ' +
      formatCount(biggest.count) + ' separate capture times.']));
  }
  if (!isPreview) {
    lines.push(csvRow(['Zip files downloaded', lastRunSummary ? lastRunSummary.zipCount : 0]));
  }
  lines.push(csvRow(['Timezone note', timezoneNoteText()]));
  lines.push('');

  // The column names, then one line per file. The date and GPS headings change
  // tense with the stage, so a column can never be read as a claim that
  // something was written when it was not.
  lines.push(csvRow(['filename', 'status', 'sidecar filename used',
                     'already has date', 'already has GPS',
                     'date source', 'part of an upload batch',
                     isPreview ? 'file date that will be set' : 'file date set',
                     isPreview ? 'date that will be written inside' : 'date written inside',
                     isPreview ? 'GPS that will be written inside' : 'GPS written inside',
                     'notes']));
  for (const row of rows) {
    lines.push(csvRow([row.filename, row.status, row.sidecar,
                       row.hadDate, row.hadGps, row.dateSource, row.uploadBatch,
                       row.fileDate, row.date, row.gps, row.error]));
  }

  // Windows-style line endings, because that is what spreadsheet programs expect.
  return lines.join('\r\n') + '\r\n';
}


/**
 * The timezone disclosure, taken straight off the page rather than copied out, so the
 * report and the screen can never end up saying two different things.
 */
function timezoneNoteText() {
  const note = document.querySelector('.timezone-note');
  return note ? note.textContent.replace(/\s+/g, ' ').trim() : '';
}


/** Joins values into one line of CSV. */
function csvRow(values) {
  return values.map(csvCell).join(',');
}


/** Makes one value safe to put in a CSV cell. */
function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);

  // A cell starting with =, +, - or @ is treated as a formula by spreadsheet programs.
  // A single quote in front stops that, and the quote itself stays hidden.
  if (/^[=+\-@]/.test(text)) text = "'" + text;

  // Wrap in quotes and double up any quotes inside, so commas, quotes and line breaks
  // inside a filename cannot break the file apart.
  return '"' + text.replace(/"/g, '""') + '"';
}


// ---------------------------------------------------------------------------
// PART 7 - STARTUP
// ---------------------------------------------------------------------------

// Decide straight away whether this browser can pick a folder at all, before
// anybody has a chance to press something that cannot work.
checkFolderPickerSupport();


/** Asks the browser to save a file we built in memory. Nothing is uploaded anywhere. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Free the memory once the browser has had a moment to start the download.
  setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
}
