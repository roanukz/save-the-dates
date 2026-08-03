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
// PART 3 - THE SCREEN
//
// Three screens, one at a time: choosing a folder, waiting, and the answer.
// Nothing in this part knows how to read a sidecar or write EXIF - it only
// decides what the person looking at the page can see.
// ---------------------------------------------------------------------------

// --- Screen 1: choosing a folder
const picker = document.getElementById('folderPicker');
const dropZone = document.getElementById('dropZone');
const dzIdle = document.getElementById('dzIdle');
const dzDragover = document.getElementById('dzDragover');
const dzRejected = document.getElementById('dzRejected');
const dzDragName = document.getElementById('dzDragName');
const dzRejectHeadline = document.getElementById('dzRejectHeadline');
const dzRejectBody = document.getElementById('dzRejectBody');
const dzRejectName = document.getElementById('dzRejectName');
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
  fixed: document.getElementById('tallyFixed'),
  cannot: document.getElementById('tallyCannot'),
  noMeta: document.getElementById('tallyNoMeta')
};
const stopButton = document.getElementById('stopButton');

// --- Screen 3: the answer
const tilesBox = document.getElementById('tiles');
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

// The names of the files this tool cannot fix, and of the JSON sidecars. Only
// the names are kept, never the files, so this costs almost no memory.
let unsupportedFiles = [];
let sidecarPaths = [];

// What the last download run actually did. Null until a run finishes.
let lastRunSummary = null;

// Set by the Stop button. Both long loops check it between files.
let stopRequested = false;

// The three running tallies shown during the wait.
let tally = { fixed: 0, cannot: 0, noMeta: 0 };

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
tryAgainButton.addEventListener('click', function () { showDropState('idle'); });

picker.addEventListener('change', function (event) {
  const files = Array.from(event.target.files);
  if (files.length > 0) handleFolder(files);
});

stopButton.addEventListener('click', function () {
  stopRequested = true;
  stopButton.disabled = true;
  stopButton.textContent = 'Stopping...';
});

downloadButton.addEventListener('click', function () { fixPhotos(); });
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
  showDropState('dragover');
  dzDragName.textContent = 'Let go to read this folder';
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
  if (dragDepth === 0) showDropState('idle');
});

dropZone.addEventListener('drop', async function (event) {
  event.preventDefault();
  event.stopPropagation();
  dragDepth = 0;

  const entries = [];
  const items = event.dataTransfer.items || [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry) entries.push(entry);
  }

  // A single file rather than a folder is the common mistake, and a .zip is
  // the commonest of all. Say so plainly and say the file is unharmed.
  if (entries.length === 1 && entries[0].isFile) {
    const name = entries[0].name;
    const isZip = /\.zip$/i.test(name);
    showRejected(
      isZip ? "That's a .zip file" : "That's a single file, not a folder",
      isZip
        ? 'Unzip it first, then drag the folder that comes out.'
        : 'Drag the whole Takeout folder instead.',
      name
    );
    return;
  }

  if (entries.length === 0) {
    showRejected("That couldn't be read", 'Try the Choose folder button instead.', '');
    return;
  }

  showDropState('idle');
  const files = [];
  for (const entry of entries) await walkEntry(entry, '', files);

  if (files.length === 0) {
    showRejected('That folder is empty', 'Pick the folder that has your photos in it.', '');
    return;
  }
  handleFolder(files);
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


// Which look the drop zone is currently wearing, so we never rewrite the DOM
// to the state it is already in.
let dropState = 'idle';

/** Switches the drop zone between its three looks. */
function showDropState(state) {
  if (state === dropState) return;
  dropState = state;
  dropZone.className = 'dropzone' +
    (state === 'dragover' ? ' is-dragover' : state === 'rejected' ? ' is-rejected' : '');
  dzIdle.hidden = state !== 'idle';
  dzDragover.hidden = state !== 'dragover';
  dzRejected.hidden = state !== 'rejected';
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
  scannedRows = [];
  fileInventory = null;
  unsupportedFiles = [];
  sidecarPaths = [];
  lastRunSummary = null;
  tableExpanded = false;
  currentFilter = 'all';
  currentPage = 1;
  tableWrap.hidden = true;
  toggleTable.setAttribute('aria-expanded', 'false');
  progressLine.textContent = '';
  skippedBox.innerHTML = '';
  picker.value = '';
  showDropState('idle');
  showPhase('idle');
}


// --- The wait --------------------------------------------------------------

/** Starts the working screen and the clock that proves it is alive. */
function beginWork(heading) {
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
const lastTickAt = { fixed: 0, cannot: 0, noMeta: 0 };

/** Sets one tally, and ticks it if it has been long enough since the last one. */
function setTally(name, value) {
  const box = tallyBoxes[name];
  if (!box) return;
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
  tally = { fixed: 0, cannot: 0, noMeta: 0 };

  beginWork('Reading your photos');
  setTally('fixed', 0); setTally('cannot', 0); setTally('noMeta', 0);
  reportWork(0, files.length, '');
  await pause();

  // Sort every file into photos or sidecars, keeping track of which folder it
  // is in. Matching is done folder by folder, because Takeout albums often
  // reuse the same filenames.
  const photos = [];
  const sidecarsByFolder = new Map();

  // Every single file gets counted, whatever it is, so nothing is quietly ignored.
  const counts = { JPEG: 0, HEIC: 0, PNG: 0, GIF: 0, WEBP: 0, MP4: 0, MOV: 0, JSON: 0, other: 0 };
  unsupportedFiles = [];
  sidecarPaths = [];

  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    const folder = folderOf(path);
    const lowerName = file.name.toLowerCase();

    const bucket = bucketFor(file.name);
    counts[bucket]++;
    if (bucket === 'JSON') {
      sidecarPaths.push(path);
    } else if (bucket !== 'JPEG') {
      unsupportedFiles.push({ path: path, type: bucket });
    }

    if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
      photos.push({ file, folder, path });
    } else if (lowerName.endsWith('.json')) {
      if (!sidecarsByFolder.has(folder)) sidecarsByFolder.set(folder, []);
      sidecarsByFolder.get(folder).push(file);
    }
  }

  fileInventory = { total: files.length, counts: counts };

  // Everything that is not a JPEG is known to be unfixable straight away.
  tally.cannot = unsupportedFiles.length;
  setTally('cannot', tally.cannot);

  // Work out the match for every photo, then read the JSON for the ones that
  // matched. This is the long part on a real library.
  const rows = [];

  for (let i = 0; i < photos.length; i++) {
    if (stopRequested) break;

    const photo = photos[i];
    const folderSidecars = sidecarsByFolder.get(photo.folder) || [];
    const sidecarNames = folderSidecars.map(f => f.name);

    const matchName = findSidecarFor(photo.file.name, sidecarNames);

    const row = {
      name: photo.file.name,
      path: photo.path,
      file: photo.file,          // kept so the download button can read it later
      sidecarName: matchName,
      data: null,
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

    rows.push(row);

    // Keep the tallies honest as we go.
    if (isFixable(row)) tally.fixed++; else tally.noMeta++;
    setTally('fixed', tally.fixed);
    setTally('noMeta', tally.noMeta);

    // Hand control back to the browser often enough that the page keeps
    // redrawing, but not so often that the scan crawls.
    if (i % 25 === 0 || i === photos.length - 1) {
      reportWork(i + 1, photos.length, photo.path);
      await pause();
    }
  }

  endWork();
  scannedRows = rows;
  showResults();
}


// --- The answer ------------------------------------------------------------

/** Draws the results screen. */
function showResults() {
  drawTiles();
  drawResultsNotices();

  const fixable = scannedRows.filter(isFixable);
  downloadLabel.textContent = fixable.length === 1
    ? 'Download 1 fixed photo'
    : 'Download ' + formatCount(fixable.length) + ' fixed photos';
  downloadButton.disabled = fixable.length === 0;
  downloadButton.removeAttribute('aria-busy');

  // The preview report is worth having even when nothing can be fixed - that is
  // exactly when a list of what was found and why is most useful.
  previewReportButton.disabled = false;

  // The results report describes a run, so until a run has happened there is
  // nothing for it to describe. Greyed out rather than hidden, so it is visible
  // that a record will exist afterwards.
  resultsReportButton.disabled = !lastRunSummary;

  toggleTableLabel.textContent = 'Show all ' + formatCount(allTableRows().length) + ' files';
  drawChips();
  if (tableExpanded) drawTable();

  showPhase('done');
}


/** The three tiles. Every number here is also written out in words. */
function drawTiles() {
  const total = tally.fixed + tally.cannot + tally.noMeta;
  const pct = n => (total > 0 ? Math.round((n / total) * 100) : 0);

  // Nothing is written until the download button is pressed, so before that the
  // first tile must not claim these photos are already done. Saying "Fixed" over
  // a folder nobody has touched yet is how somebody ends up believing their
  // photos were processed when they were not.
  const written = Boolean(lastRunSummary);

  const tiles = [
    { kind: 'success', icon: 'success',
      label: written ? 'Fixed' : 'Ready to fix',
      count: tally.fixed,
      desc: written
        ? 'dates written back into the photo'
        : 'dates ready to write back - press Download below' },
    { kind: 'notice', icon: 'notice', label: "Can't be fixed", count: tally.cannot,
      desc: describeUnfixable() },
    { kind: 'warning', icon: 'warning', label: 'No metadata', count: tally.noMeta,
      desc: 'no usable JSON file was found beside them' }
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


/** Names the biggest kind of file we had to leave alone, e.g. "HEIC files". */
function describeUnfixable() {
  if (!fileInventory || tally.cannot === 0) return 'nothing here needed leaving out';

  const counts = fileInventory.counts;
  let biggest = null;
  for (const label of CANNOT_FIX_BUCKETS) {
    if (counts[label] > 0 && (!biggest || counts[label] > counts[biggest])) biggest = label;
  }
  const lead = biggest && biggest !== 'other' ? biggest + ' and other files' : 'files this tool cannot read';
  return lead + ' - left exactly as they are';
}


/**
 * The notice under the tiles. A notice names the fact and then says what
 * happens to the user's files: "can't be fixed" on its own is frightening,
 * "left exactly as they are" is the half that takes the fear away.
 */
function drawResultsNotices() {
  if (tally.cannot === 0) { resultsNotices.innerHTML = ''; return; }

  const counts = fileInventory ? fileInventory.counts : {};
  const parts = [];
  for (const label of CANNOT_FIX_BUCKETS) {
    if (counts[label] > 0) parts.push(formatCount(counts[label]) + ' ' + label);
  }

  const body = joinWithAnd(parts) + ' ' + plural(tally.cannot, 'file') +
    " can't be fixed by this tool. They are left exactly as they are, and they are " +
    'not included in the download.' +
    (counts.JSON > 0
      ? ' The ' + formatCount(counts.JSON) + ' JSON metadata ' + plural(counts.JSON, 'file') +
        ' are where the dates come from; they are not photos, so they are not in the download either.'
      : '');

  resultsNotices.innerHTML =
    '<div class="notice">' + iconSvg('notice', 'notice-icon') +
    '<div><p class="notice-label">Good to know</p>' +
    '<p class="notice-body">' + escapeHtml(body) + '</p></div></div>';
}


// --- The table -------------------------------------------------------------

/**
 * Every file, in one list, with the status it ended up with.
 *   fixed      - a sidecar was found and had something usable in it
 *   noMetadata - a sidecar was found but held no date and no location
 *   unmatched  - no sidecar was found at all
 *   cannotFix  - not a JPEG, so this tool never had a way in
 */
function allTableRows() {
  const out = [];

  for (const row of scannedRows) {
    let status;
    if (isFixable(row)) status = 'fixed';
    else if (!row.sidecarName) status = 'unmatched';
    else status = 'noMetadata';
    out.push({ status: status, path: row.path, row: row });
  }

  for (const item of unsupportedFiles) {
    out.push({ status: 'cannotFix', path: item.path, type: item.type, row: null });
  }

  return out;
}


const STATUS_WORDS = {
  fixed:      { word: 'Fixed', icon: 'success', cls: 'row-fixed' },
  noMetadata: { word: 'No metadata', icon: 'warning', cls: 'row-nometa' },
  unmatched:  { word: "Couldn't match", icon: 'error', cls: 'row-unmatched' },
  cannotFix:  { word: "Can't be fixed", icon: 'notice', cls: 'row-cannot' }
};


/** The filter chips. Each one carries its own icon, not just its colour. */
function drawChips() {
  const all = allTableRows();
  const counts = {
    all: all.length,
    fixed: all.filter(r => r.status === 'fixed').length,
    cannotFix: all.filter(r => r.status === 'cannotFix').length,
    noMetadata: all.filter(r => r.status === 'noMetadata' || r.status === 'unmatched').length
  };

  const chips = [
    { key: 'all', label: 'All', icon: null },
    { key: 'fixed', label: 'Fixed', icon: 'success' },
    { key: 'cannotFix', label: "Can't be fixed", icon: 'notice' },
    { key: 'noMetadata', label: 'No metadata', icon: 'warning' }
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
  if (currentFilter === 'noMetadata') {
    return all.filter(r => r.status === 'noMetadata' || r.status === 'unmatched');
  }
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

  let found = '<span class="empty">&mdash;</span>';
  let written = '<span class="empty">&mdash;</span>';

  if (entry.status === 'fixed' && row.data) {
    found = escapeHtml(formatFoundDate(row.data));
    written = escapeHtml(formatDate(row.data.timestamp, row.data.timezone));
  } else if (entry.status === 'noMetadata') {
    found = '<span class="empty">none found</span>';
    written = '<span class="empty">left unchanged</span>';
  } else if (entry.status === 'cannotFix') {
    found = '<span class="empty">not read</span>';
    written = '<span class="empty">left unchanged</span>';
  }

  return '<tr class="' + meta.cls + '">' +
    '<td class="cell-wrap-status"><span class="cell-status">' +
      iconSvg(meta.icon) + escapeHtml(meta.word) + '</span></td>' +
    '<td><span class="cell-file" title="' + escapeHtml(entry.path) + '">' +
      escapeHtml(entry.path) + '</span></td>' +
    '<td class="col-date col-date-found" data-label="Date found">' + found + '</td>' +
    '<td class="col-date" data-label="Date written">' + written + '</td>' +
    '</tr>';
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
    '<span>' + formatCount(first) + '&ndash;' + formatCount(last) +
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
// coloured: notice is the only square, warning the only triangle, and info,
// success and error are circles that differ in what is inside them. They stay
// apart with every drop of colour removed.

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
  { label: 'JPEG', extensions: ['.jpg', '.jpeg'] },
  { label: 'HEIC', extensions: ['.heic', '.heif'] },
  { label: 'PNG',  extensions: ['.png'] },
  { label: 'GIF',  extensions: ['.gif'] },
  { label: 'WEBP', extensions: ['.webp'] },
  { label: 'MP4',  extensions: ['.mp4'] },
  { label: 'MOV',  extensions: ['.mov'] },
  { label: 'JSON', extensions: ['.json'] }
];

// The buckets this tool cannot do anything with, in the order they are listed.
const CANNOT_FIX_BUCKETS = ['HEIC', 'PNG', 'GIF', 'WEBP', 'MP4', 'MOV', 'other'];


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
 */
function applyDateAndGpsTags(exifObj, data) {
  if (data.timestamp) {
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

  if (data.latitude !== null && data.longitude !== null) {
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
function writeExifIntoJpeg(jpegBinary, data) {
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
  applyDateAndGpsTags(exifObj, data);

  // Turn the tags back into raw EXIF bytes, then put them into the JPEG.
  return piexif.insert(dumpExifSafely(exifObj, data), jpegBinary);
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
function dumpExifSafely(exifObj, data) {
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
  applyDateAndGpsTags(minimal, data);
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

/** A photo is worth fixing if we found a sidecar with a date or a location in it. */
function isFixable(row) {
  return Boolean(row.data) && (Boolean(row.data.timestamp) || row.data.latitude !== null);
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
 * The "date modified" to stamp on a photo inside the zip.
 *
 * THE PROBLEM. A zip file records "date modified" as a bare clock reading - "3rd of
 * August, 03:31" - with no timezone attached at all. Whatever unzips the file reads
 * that as LOCAL time. JSZip fills the reading in from UTC, so on any computer that is
 * not on UTC every photo comes out with a date modified that is wrong by however far
 * your timezone sits from UTC. Four hours into the future on New York time.
 *
 * THE FIX. Wind the clock back by that same gap before handing the date over. JSZip
 * then stores the local reading, which is what the unzipping program is expecting.
 *
 * This is the ONE place the computer's own timezone is the right thing to use, and it
 * does not touch the photo's capture date. "Date modified" means "when this file was
 * written, on this computer", so the computer's clock is exactly the right answer. The
 * date inside the photo is a different question - that still comes from the GPS
 * position and never from this computer.
 */
function zipDateFor(moment) {
  return new Date(moment.getTime() - moment.getTimezoneOffset() * 60000);
}


/** Runs when the button is clicked: writes the EXIF, zips it all up, downloads it. */
async function fixPhotos() {
  const todo = scannedRows.filter(isFixable);
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

  // Back to the waiting screen. Writing and zipping is the second long stretch,
  // and it deserves the same five signs of life as the first one.
  beginWork('Fixing your photos');
  reportWork(0, todo.length, '');

  const skipped = [];   // files that went wrong
  const renamed = [];   // files renamed because two folders used the same name
  const usedNames = new Set();
  let fixedCount = 0;
  let zipsMade = 0;
  let doneCount = 0;    // photos finished so far, counted across ALL the batches

  for (let c = 0; c < chunks.length; c++) {

    // A brand new, empty zip for each batch.
    let zip = new JSZip();
    let fixedInThisZip = 0;

    for (const row of chunks[c]) {
      if (stopRequested) break;
      doneCount++;

      // Update the counter every file, and hand control back to the browser every few
      // files so the page keeps redrawing instead of looking frozen. The count runs
      // straight through from the first photo to the last, across all the batches.
      reportWork(doneCount, todo.length, row.path);
      if (doneCount % 5 === 0) await pause();

      try {
        // Read the photo, write the new EXIF into it, and add it to the zip.
        const bytes = new Uint8Array(await row.file.arrayBuffer());
        const fixedBinary = writeExifIntoJpeg(bytesToBinaryString(bytes), row.data);

        const nameInZip = makeUniqueName(row.name, usedNames);
        if (nameInZip !== row.name) renamed.push(row.path + ' -> ' + nameInZip);

        // The date stamp has to be corrected on the way in, or every photo comes out
        // of the zip with a date modified in the future. See zipDateFor above.
        zip.file(nameInZip, binaryStringToBytes(fixedBinary), { date: zipDateFor(new Date()) });
        fixedCount++;
        fixedInThisZip++;

        // Remember how this one went, so the report can say so later.
        row.runStatus = 'fixed';
        row.runError = null;
      } catch (e) {
        // One bad photo must never stop the run.
        const reason = e && e.message ? e.message : String(e);
        skipped.push({ name: row.path, reason: reason });
        row.runStatus = 'error';
        row.runError = reason;
      }

      // The Stop button promises to keep what has already been done, so the
      // batch that is part-built still gets zipped and downloaded below.
      stopButton.textContent = 'Stop - keep the ' + formatCount(fixedCount) + ' already fixed';
    }

    // Every photo in this batch failed, so there is no zip worth building.
    if (fixedInThisZip === 0) {
      zip = null;
      await pause();
      continue;
    }

    // Squeeze this batch into a zip file. This also takes a while, so keep the
    // ticker talking rather than letting the screen go quiet.
    workHeading.textContent = 'Building ' + zipNameFor(c, chunks.length);
    tickerFile.textContent = 'Packing ' + formatCount(fixedInThisZip) + ' photos...';
    await pause();

    let blob = await zip.generateAsync(
      { type: 'blob', compression: 'STORE' },   // photos are already compressed
      function (status) {
        tickerFile.textContent = 'Packing ' + formatCount(fixedInThisZip) +
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

  if (fixedCount === 0) {
    progressLine.textContent = 'Nothing could be fixed. See the list below.';
  } else {
    progressLine.textContent =
      (stopRequested ? 'Stopped. Kept ' : 'Done. Fixed ') + formatCount(fixedCount) +
      ' photos in ' + zipsMade + ' zip ' + plural(zipsMade, 'file') +
      (skipped.length > 0 ? '. Skipped ' + skipped.length : '') +
      '. Your ' + plural(zipsMade, 'download') + ' should have started.';
  }

  drawSkipped(skipped, renamed);

  // Remember what happened, and let the report be downloaded now there is something
  // real to put in it.
  lastRunSummary = { fixedCount: fixedCount, skippedCount: skipped.length, zipCount: zipsMade };
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
function drawSkipped(skipped, renamed) {
  let html = '';

  if (skipped.length > 0) {
    html += '<p class="skipped-title">These files could not be fixed and are not in the zip:</p><ul class="skipped-list">';
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

  // The files this tool cannot fix: HEIC, video, and anything else.
  for (const item of unsupportedFiles) {
    rows.push({
      filename: item.path,
      status: 'unsupported-type',
      sidecar: '',
      date: '',
      gps: '',
      error: 'Not a JPEG (' + item.type + '), so this tool cannot fix it'
    });
  }

  // The JSON sidecars. They are read for their dates and locations but are not
  // photos, so nothing is written to them and they are not in the download.
  for (const path of sidecarPaths) {
    rows.push({
      filename: path,
      status: 'unsupported-type',
      sidecar: '',
      date: '',
      gps: '',
      error: 'JSON metadata file - read for its date and location, not a photo'
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
    date: '',
    gps: '',
    error: ''
  };

  // No sidecar was found, so there was never anything to write.
  if (!row.sidecarName) {
    entry.status = 'no-sidecar';
    return entry;
  }

  // A sidecar was found but could not be read.
  if (row.error) {
    entry.status = 'skipped-error';
    entry.error = row.error;
    return entry;
  }

  // The sidecar was read but had neither a date nor a location in it.
  if (!isFixable(row)) {
    entry.status = 'skipped-error';
    entry.error = 'The sidecar had no date and no location in it';
    return entry;
  }

  // Everything left is a photo this tool CAN fix.

  // The preview report answers "what will happen", so it never looks at the run
  // at all. It fills in the date and location that ARE going to be written,
  // which is the whole point of checking before committing to a big download.
  if (stage === 'preview') {
    entry.status = 'ready-to-fix';
    entry.date = describeWrittenDate(row.data);
    entry.gps = describeWrittenGps(row.data);
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
    entry.status = 'fixed';
    entry.date = describeWrittenDate(row.data);
    entry.gps = describeWrittenGps(row.data);
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
    lines.push(csvRow(['Photos ready to fix', n('ready-to-fix')]));
  } else {
    lines.push(csvRow(['Photos fixed', n('fixed')]));
    lines.push(csvRow(['Photos not reached (run stopped early)', n('ready-to-fix')]));
  }
  lines.push(csvRow(['Photos with no sidecar', n('no-sidecar')]));
  lines.push(csvRow(['Photos skipped because of an error', n('skipped-error')]));
  lines.push(csvRow(['Files that are not JPEGs (JSON sidecars, HEIC, video and so on)',
                     n('unsupported-type')]));
  if (!isPreview) {
    lines.push(csvRow(['Zip files downloaded', lastRunSummary ? lastRunSummary.zipCount : 0]));
  }
  lines.push(csvRow(['Timezone note', timezoneNoteText()]));
  lines.push('');

  // The column names, then one line per file. The date and GPS headings change
  // tense with the stage, so a column can never be read as a claim that
  // something was written when it was not.
  lines.push(csvRow(['filename', 'status', 'sidecar filename used',
                     isPreview ? 'date that will be written' : 'date written',
                     isPreview ? 'GPS that will be written' : 'GPS written',
                     'error message']));
  for (const row of rows) {
    lines.push(csvRow([row.filename, row.status, row.sidecar, row.date, row.gps, row.error]));
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
