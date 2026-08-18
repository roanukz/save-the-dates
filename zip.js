// =============================================================================
// READING A TAKEOUT .ZIP WITHOUT UNPACKING IT FIRST
// =============================================================================
//
// WHY THIS FILE EXISTS.
// Google hands you .zip files. Before this, the tool made you double-click every
// one of them, drag the contents into a single folder, and only then choose that
// folder. Two whole steps of the instructions existed to explain that, and they
// were the two steps people got wrong: a photo's date can live in one zip while
// the photo lives in another, so unpacking a partial set gives a partial result.
// This file lets the zips be dropped in as they arrived.
//
// WHY IT DOES NOT USE JSZip, WHICH IS ALREADY IN vendor/.
// JSZip reads an archive by loading all of it into memory. A Takeout part is
// commonly 2 GB and can be 50 GB, so that crashes the tab before any photo has
// been looked at. Worse, JSZip reads the index offset with a 32-bit signed shift,
// so it fails outright on any archive over 2 GB whether or not it is a large-
// format one. What this file does instead is what an unzip program does: read the
// small index at the END of the file, which lists every entry and where it starts,
// and then fetch one entry at a time.
//
// WHAT I ASSUMED, AND WHAT MEASURING SHOWED. The first version of this comment
// argued that the saving comes from photos being stored verbatim: a JPEG is
// already compressed, so an archiver has nothing to gain by compressing it again,
// and reading one would be a plain read at an offset. That is a claim about
// Google's archiver rather than a property of the format, and it is wrong. Two
// real exports, 91 and 121 entries, August 2026: every single entry is deflated,
// photos included. The photos come out at 100.0% of their original size, so the
// compression achieves exactly nothing and Google does it anyway.
//
// The design survives because it never depended on that. Reading is still lazy
// and memory is still flat, for a different reason: an entry is inflated as a
// STREAM and only the requested window is kept, so scanning the first 64 KB of a
// photo costs 64 KB rather than the whole photo. What the measurement did change
// is the cost of a scan. Every read of a deflated entry starts from the front of
// that entry, because deflate cannot be entered partway, so a photo is inflated
// once to scan it and once again to write it out. The verbatim path below is kept
// and tested, because other archivers do use it and a re-zipped export will, but
// nothing here assumes Google will.
//
// So: no new library, and memory that stays flat no matter how big the zip is.
// JSZip stays where it was, writing the output.
//
// EVERYTHING HERE IS READ ONLY. No zip is ever modified. The originals Google
// sent are never touched.

(function (global) {
  'use strict';

  // The four signatures that mark the structures we need. Zip files are found by
  // reading these markers rather than by trusting any offset arithmetic.
  const SIG_END_OF_INDEX = 0x06054b50;        // "end of central directory"
  const SIG_END_OF_INDEX_64 = 0x06064b50;     // the same thing, for big archives
  const SIG_END_LOCATOR_64 = 0x07064b50;      // points at the one above
  const SIG_ENTRY_IN_INDEX = 0x02014b50;      // one entry, in the index
  const SIG_ENTRY_HEADER = 0x04034b50;        // one entry, at its actual position

  // The index sits at the very end of the file, after a comment that the format
  // allows to be up to 64 KB. So the furthest back we ever have to look is that
  // comment plus the 22-byte record itself.
  const MAX_TAIL = 65535 + 22;

  // How a zip says it stored something.
  const STORED = 0;      // verbatim. Other archivers use it; measured, Google does not
  const DEFLATED = 8;    // compressed. Measured, this is what Google uses for everything

  // NOTHING IS CACHED, AND THAT IS DELIBERATE.
  //
  // An earlier version kept any entry under 4 MB in memory after its first full
  // read, on the theory that entries get read twice. Two things were wrong with
  // it. Nothing is actually read in full twice in one run: the scan reads only
  // the front of a file, and the write reads it once. And 4 MB catches almost
  // every photo, so what was described as a small cache for sidecars in fact
  // retained the whole library, which is the exact opposite of the promise this
  // file exists to keep.
  //
  // It was also unsound. The cached copy was stored BEFORE the checksum was
  // verified, and a cache hit returned early, past both the length check and the
  // checksum. So a damaged entry could fail verification once and then be served
  // as good on every later read. Re-inflating costs a second on a re-run and
  // buys back both the flat memory and the guarantee.


  // --- Reading numbers out of a chunk of bytes -------------------------------
  //
  // Everything in a zip is little-endian, so these all pass `true`.

  function u16(view, at) { return view.getUint16(at, true); }
  function u32(view, at) { return view.getUint32(at, true); }

  /**
   * Reads a 64-bit number. Sizes and offsets in a big archive need all 64 bits,
   * and JavaScript numbers are exact up to about 9 petabytes, so converting to a
   * plain number is safe for anything that could exist on a disk. The conversion
   * is checked anyway rather than assumed.
   */
  function u64(view, at) {
    const value = view.getBigUint64(at, true);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('This zip declares a size too large to handle.');
    }
    return Number(value);
  }


  /**
   * Turns the date and time a zip stores into a real timestamp.
   *
   * Zip inherited MS-DOS's date format, which packs a date into 16 bits and a
   * time into 16 more. Seconds only get 5 bits, so they are stored halved, which
   * is why the format cannot express an odd second.
   *
   * WHAT THIS DATE IS NOT. The first version of this comment claimed that reading
   * the zip recovers a real last-resort date, where unzipping by hand would throw
   * it away and stamp the moment of extraction. That was worth checking, and it is
   * wrong. Measured on two real exports, August 2026: 91 entries carrying 4
   * distinct timestamps, and 121 entries carrying 5, spanning 62 seconds in the
   * second case. Photos taken over years do not share five timestamps a minute
   * apart. This is the moment Google packed the archive, not the moment anything
   * was photographed.
   *
   * That is the same shape as the upload-batch pattern the tool already refuses to
   * write into a photo, arrived at from a different direction, so it gets the same
   * treatment: it is never a capture date, it is never written inside a file, and
   * a file with nothing better is counted as having no date anywhere. It is still
   * used for the date on the OUTSIDE of the copy, because something has to go
   * there and the packing moment beats the moment you happened to run this.
   */
  function dosTimeToMillis(dosDate, dosTime) {
    const year = ((dosDate >> 9) & 0x7f) + 1980;
    const month = (dosDate >> 5) & 0x0f;
    const day = dosDate & 0x1f;
    const hour = (dosTime >> 11) & 0x1f;
    const minute = (dosTime >> 5) & 0x3f;
    const second = (dosTime & 0x1f) * 2;

    // A zero date means the zip did not record one. Say so with NaN rather than
    // inventing 1980, so callers can tell "unknown" from "very old".
    if (dosDate === 0) return NaN;

    // Zip stores wall-clock time with no timezone, so it is read as local time,
    // which is the same thing every unzip program does.
    return new Date(year, month - 1, day, hour, minute, second).getTime();
  }


  // --- Checking that the bytes are the bytes ---------------------------------
  //
  // Every entry in a zip carries a checksum of what it should contain. These are
  // 2 GB to 50 GB downloads over ordinary home connections, and a download that
  // ends up subtly wrong is a real thing that happens. Without this check a
  // damaged photo is copied into the output and presented as repaired, which is
  // worse than refusing it: the person deletes the original believing the new
  // copy is good.
  //
  // The cost is one pass over bytes that are already in memory, and it happens
  // only on a full read, never on the small scanning reads.

  let crcTable = null;

  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Int32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let bit = 0; bit < 8; bit++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        crcTable[i] = c;
      }
    }
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }


  /**
   * Can this browser inflate raw deflate data? Asked once, by actually building
   * one, because the class existing does not mean the format is supported.
   */
  let inflateSupport = null;
  function canInflate() {
    if (inflateSupport === null) {
      try {
        inflateSupport = typeof DecompressionStream === 'function' &&
          !!new DecompressionStream('deflate-raw');
      } catch (e) {
        inflateSupport = false;
      }
    }
    return inflateSupport;
  }


  /** Decodes an entry's name. Bit 11 of the flags promises UTF-8. */
  function decodeName(bytes, flags) {
    // Google writes UTF-8 and sets the flag. The fallback is latin1, which at
    // least never throws and leaves plain ASCII names correct.
    const utf8 = (flags & 0x800) !== 0;
    return new TextDecoder(utf8 ? 'utf-8' : 'windows-1252').decode(bytes);
  }


  // --- Finding the index at the end of the file ------------------------------

  /**
   * Reads the last stretch of the file and finds the end-of-index record in it.
   * Scans backwards, because the record is near the end and a comment further
   * back could contain bytes that look like the signature.
   */
  async function findEndOfIndex(blob) {
    const tailLength = Math.min(MAX_TAIL, blob.size);
    const tailStart = blob.size - tailLength;
    const tail = new DataView(await blob.slice(tailStart).arrayBuffer());

    for (let at = tail.byteLength - 22; at >= 0; at--) {
      if (u32(tail, at) !== SIG_END_OF_INDEX) continue;

      // A real record's comment length has to account for exactly the bytes left.
      const commentLength = u16(tail, at + 20);
      if (at + 22 + commentLength !== tail.byteLength) continue;

      return {
        diskNumber: u16(tail, at + 4),
        indexDisk: u16(tail, at + 6),
        entriesThisDisk: u16(tail, at + 8),
        entryCount: u16(tail, at + 10),
        indexSize: u32(tail, at + 12),
        indexOffset: u32(tail, at + 16),
        recordAt: tailStart + at,
        tail: tail,
        tailStart: tailStart,
        at: at,
      };
    }
    return null;
  }


  /**
   * Big archives keep a second, wider copy of the same record, because the
   * original could only express 4 GB. When the small one is holding the all-ones
   * placeholder, the real numbers are in the wide one. Takeout produces these
   * whenever a part goes over 4 GB, which the 10 GB and 50 GB split sizes do.
   */
  async function upgradeToZip64(blob, end) {
    // The all-ones placeholder can appear in any of these, and some writers set
    // the disk fields alone. Any one of them means the real numbers are wider.
    const needsUpgrade =
      end.indexOffset === 0xffffffff ||
      end.indexSize === 0xffffffff ||
      end.entryCount === 0xffff ||
      end.diskNumber === 0xffff ||
      end.indexDisk === 0xffff ||
      end.entriesThisDisk === 0xffff;

    // Nothing to widen, so the ordinary record is the whole truth.
    if (!needsUpgrade) return end;

    // From here the ordinary record is KNOWN to be holding a placeholder, so
    // anything that goes wrong has to be an error rather than a quiet return.
    // Handing back the placeholder would send the reader to offset 4294967295,
    // find nothing, and report an empty zip, which blames the wrong thing.
    const locatorAt = end.at - 20;
    if (locatorAt < 0 || u32(end.tail, locatorAt) !== SIG_END_LOCATOR_64) {
      throw new Error('This zip says it is a large archive but its index is missing.');
    }

    const wideAt = u64(end.tail, locatorAt + 8);
    const wide = new DataView(await blob.slice(wideAt, wideAt + 56).arrayBuffer());
    if (u32(wide, 0) !== SIG_END_OF_INDEX_64) {
      throw new Error('This zip says it is a large archive but its index is missing.');
    }

    return {
      entryCount: u64(wide, 32),
      indexSize: u64(wide, 40),
      indexOffset: u64(wide, 48),
    };
  }


  /**
   * A zip64 extra field carries the real size and position when the ordinary
   * fields are holding the all-ones placeholder. The fields are present only
   * for whichever values overflowed, in a fixed order, so this walks them in
   * that order and takes each one only if it was actually needed.
   */
  function readZip64Extra(view, at, length, entry) {
    let cursor = at;
    const end = at + length;

    while (cursor + 4 <= end) {
      const id = u16(view, cursor);
      const size = u16(view, cursor + 2);
      let field = cursor + 4;

      if (id === 0x0001) {
        if (entry.uncompressedSize === 0xffffffff && field + 8 <= end) {
          entry.uncompressedSize = u64(view, field); field += 8;
        }
        if (entry.compressedSize === 0xffffffff && field + 8 <= end) {
          entry.compressedSize = u64(view, field); field += 8;
        }
        if (entry.headerOffset === 0xffffffff && field + 8 <= end) {
          entry.headerOffset = u64(view, field); field += 8;
        }
      }
      cursor += 4 + size;
    }
  }


  /**
   * Reads the whole index and returns one record per entry.
   *
   * The count the archive declares is checked against the number actually read.
   * That check matters more here than it would almost anywhere else: if one
   * entry's extra fields are malformed, the walk loses its place, the next
   * signature test fails, and the loop stops early. Without the check that
   * failure is invisible. The scan would run happily over the entries it did
   * find and report a healthy result for half a library, which is the one
   * outcome this whole tool exists to prevent.
   */
  async function readIndex(blob, end) {
    const view = new DataView(
      await blob.slice(end.indexOffset, end.indexOffset + end.indexSize).arrayBuffer()
    );

    const entries = [];
    let at = 0;

    while (at + 46 <= view.byteLength) {
      if (u32(view, at) !== SIG_ENTRY_IN_INDEX) break;

      const flags = u16(view, at + 8);
      const nameLength = u16(view, at + 28);
      const extraLength = u16(view, at + 30);
      const commentLength = u16(view, at + 32);

      const entry = {
        flags: flags,
        method: u16(view, at + 10),
        modifiedAt: dosTimeToMillis(u16(view, at + 14), u16(view, at + 12)),
        crc32: u32(view, at + 16),
        compressedSize: u32(view, at + 20),
        uncompressedSize: u32(view, at + 24),
        headerOffset: u32(view, at + 42),
        name: '',
        encrypted: (flags & 0x0001) !== 0,
      };

      const nameAt = at + 46;
      entry.name = decodeName(
        new Uint8Array(view.buffer, view.byteOffset + nameAt, nameLength), flags
      );

      readZip64Extra(view, nameAt + nameLength, extraLength, entry);
      entries.push(entry);

      at = nameAt + nameLength + extraLength + commentLength;
    }

    // The count is only trusted as a lower bound. Some writers record the count
    // for one disk of a multi-disk set, so reading MORE than declared is not
    // itself wrong; reading fewer means entries were lost.
    if (entries.length < end.entryCount) {
      throw new Error(
        'This zip says it holds ' + formatCountPlain(end.entryCount) + ' files but only ' +
        formatCountPlain(entries.length) + ' could be read, so it is damaged or was not ' +
        'downloaded completely. Download it from Google again rather than trusting a ' +
        'partial result.'
      );
    }

    return entries;
  }


  /**
   * Works out where an entry's bytes actually begin.
   *
   * The index says where an entry's HEADER is, not where its data is, and the
   * header repeats the name and the extra fields at lengths that are allowed to
   * differ from the ones in the index. So the header has to be read to find out
   * how far past it the data starts. This is why it cannot be skipped.
   */
  async function findDataStart(blob, entry) {
    if (entry.dataStart !== undefined) return entry.dataStart;

    const header = new DataView(
      await blob.slice(entry.headerOffset, entry.headerOffset + 30).arrayBuffer()
    );
    if (u32(header, 0) !== SIG_ENTRY_HEADER) {
      throw new Error('An entry in this zip does not start where the index says.');
    }

    const nameLength = u16(header, 26);
    const extraLength = u16(header, 28);
    entry.dataStart = entry.headerOffset + 30 + nameLength + extraLength;
    return entry.dataStart;
  }


  // --- Getting an entry's bytes back out -------------------------------------

  /**
   * Inflates a compressed entry, stopping as soon as enough has been produced.
   *
   * The early stop is what makes scanning cheap. The tool reads the first 64 KB
   * of a file to look for its metadata, so there is no reason to inflate the
   * rest of it just to throw it away.
   */
  async function inflateRange(blob, entry, start, end) {
    const dataStart = await findDataStart(blob, entry);
    const compressed = blob.slice(dataStart, dataStart + entry.compressedSize);

    const stream = compressed.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const reader = stream.getReader();

    const wanted = end - start;
    const out = new Uint8Array(wanted);
    let produced = 0;   // how far through the whole entry we are
    let filled = 0;     // how much of `out` is written

    try {
      while (filled < wanted) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkStart = produced;
        const chunkEnd = produced + value.length;
        produced = chunkEnd;

        // Skip chunks entirely before the window we were asked for.
        if (chunkEnd <= start) continue;

        const copyFrom = Math.max(0, start - chunkStart);
        const copyTo = Math.min(value.length, end - chunkStart);
        if (copyTo > copyFrom) {
          out.set(value.subarray(copyFrom, copyTo), filled);
          filled += copyTo - copyFrom;
        }
      }
    } finally {
      // Releasing the lock lets the browser drop the rest of the stream instead
      // of quietly inflating a whole photo nobody asked for.
      reader.cancel().catch(function () { /* already finished, nothing to stop */ });
    }

    return filled === wanted ? out : out.subarray(0, filled);
  }


  /**
   * Returns the bytes for part of an entry, whichever way it was stored.
   *
   * A stored entry is the cheap path and the common one: the bytes are already
   * lying in the zip, so this is a plain read at an offset and the browser never
   * holds the file in memory.
   */
  async function readRange(blob, entry, start, end) {
    const clampedEnd = Math.min(end, entry.uncompressedSize);
    const clampedStart = Math.min(start, clampedEnd);
    if (clampedEnd <= clampedStart) return new Uint8Array(0);

    const isWholeEntry = clampedStart === 0 && clampedEnd === entry.uncompressedSize;
    let bytes;

    if (entry.method === STORED) {
      const dataStart = await findDataStart(blob, entry);
      const slice = blob.slice(dataStart + clampedStart, dataStart + clampedEnd);
      bytes = new Uint8Array(await slice.arrayBuffer());

    } else if (entry.method === DEFLATED) {
      bytes = await inflateRange(blob, entry, clampedStart, clampedEnd);

    } else {
      throw new Error('This zip uses a compression method the browser cannot read.');
    }

    // Something stopped early. Say so rather than handing back a short file that
    // would be written into the output as though it were complete.
    if (bytes.length < clampedEnd - clampedStart) {
      throw new Error(
        'This file ended sooner than the zip said it would, so the zip is damaged ' +
        'or the download did not finish.'
      );
    }

    // Only a whole file can be checked, because the checksum covers the whole
    // file. The scanning reads are prefixes and are simply not checked.
    //
    // Every whole read is checked, not just the first. Remembering that an entry
    // passed once would mean trusting a later read on the strength of an earlier
    // one, and the bytes are already in hand, so the check is a pass over memory.
    if (isWholeEntry && entry.uncompressedSize > 0) {
      if (crc32(bytes) !== entry.crc32) {
        throw new Error(
          'This file does not match the checksum stored beside it in the zip, which ' +
          'means the download is damaged. Download this part from Google again.'
        );
      }
    }

    return bytes;
  }


  // --- The thing the rest of the app is handed -------------------------------
  //
  // The app already knows how to work through a list of files that each carry a
  // path. Rather than teach it about zips, each entry is wrapped in something
  // that behaves like a file: same properties, same methods, same promises. The
  // scanning, matching, EXIF and report code is untouched and cannot tell the
  // difference.

  function ZipEntryFile(blob, entry, path) {
    this._blob = blob;
    this._entry = entry;
    // Split on either separator. The format permits a backslash in an entry
    // name, and splitting only on '/' would carry a name like `..\..\x.jpg`
    // through to the output whole. Google never produces one; a hand-made or
    // hostile archive can. webkitRelativePath keeps the original path, so
    // matching and the reports are unaffected.
    this.name = path.split(/[\\/]/).pop();
    this.webkitRelativePath = path;
    this.size = entry.uncompressedSize;
    this.lastModified = entry.modifiedAt;
    this.type = '';
    // Marks where this came from, so the tool can say "from the zip you dropped"
    // rather than describing a folder that does not exist.
    this.fromZip = true;
  }

  /**
   * A zip is read over the minutes a big library takes, and the browser only
   * holds a reference to the file on disk, not its contents. If the file is
   * moved, renamed or rewritten in the meantime, every later read fails with a
   * browser error that explains nothing. This turns that into a sentence that
   * says what happened and what to do about it.
   */
  async function guarded(promise) {
    try {
      return await promise;
    } catch (e) {
      if (e && (e.name === 'NotReadableError' || e.name === 'NotFoundError')) {
        throw new Error(
          'The zip was moved, renamed or changed while it was being read, so the ' +
          'rest of it could not be reached. Nothing was written. Put it back, or ' +
          'drop it again, and start over.'
        );
      }
      throw e;
    }
  }

  /** Hands back a buffer of exactly this length, never a view into a longer one. */
  function exactBuffer(bytes) {
    return bytes.byteLength === bytes.buffer.byteLength
      ? bytes.buffer
      : bytes.slice().buffer;
  }

  ZipEntryFile.prototype.arrayBuffer = async function () {
    return exactBuffer(await guarded(readRange(this._blob, this._entry, 0, this.size)));
  };

  ZipEntryFile.prototype.text = async function () {
    return new TextDecoder('utf-8').decode(
      await guarded(readRange(this._blob, this._entry, 0, this.size))
    );
  };

  /**
   * Mirrors Blob.slice closely enough for the calls this app makes: a start and
   * an end, then arrayBuffer() on the result. The read is deferred until then,
   * so slicing costs nothing on its own.
   *
   * DELIBERATELY NOT A REAL BLOB. Returning an actual Blob would mean having the
   * bytes already, which is the whole thing being avoided. So this will not
   * survive being handed to FileReader, URL.createObjectURL, new Response() or
   * JSZip. Nothing does that today: the three call sites in app.js all read
   * arrayBuffer() straight away. If that ever changes, this is the thing to fix.
   */
  ZipEntryFile.prototype.slice = function (start, end) {
    const from = start === undefined ? 0 : Math.max(0, start);
    const to = end === undefined ? this.size : Math.min(end, this.size);
    const self = this;

    return {
      size: Math.max(0, to - from),
      arrayBuffer: async function () {
        return exactBuffer(await guarded(readRange(self._blob, self._entry, from, to)));
      },
    };
  };


  // --- What gets ignored, and why -------------------------------------------

  /** Entries that are not files anyone asked for. */
  function shouldSkip(name) {
    if (name.endsWith('/')) return true;                  // a folder marker
    if (name.startsWith('__MACOSX/')) return true;         // macOS resource forks
    const base = name.split(/[\\/]/).pop();
    if (base === '.DS_Store') return true;
    if (base.startsWith('._')) return true;                // more macOS leftovers
    // An entry that is nothing but path steps is not a file anyone asked for.
    return base === '' || base === '.' || base === '..';
  }


  // --- The one function the app calls ---------------------------------------

  /**
   * Reads one .zip and returns its files, each looking like a normal file.
   *
   * Nothing is decompressed here. This reads only the index, which is a few
   * hundred kilobytes even for a huge archive, so a 50 GB zip opens as fast as a
   * small one. The photos are fetched later, one at a time, as they are needed.
   */
  async function readZip(file) {
    const problems = [];

    // Inflating uses the browser's own decompressor, which arrived in Safari
    // 16.4 and Firefox 113, both in 2023. Older browsers get told plainly, and
    // the folder route still works for them, so this is a narrowing rather than
    // a wall. Checked before anything is read so the answer is instant.
    //
    // Testing that DecompressionStream EXISTS is not enough, and getting this
    // wrong is worse than not checking. Chromium shipped the class in 80 but the
    // raw deflate format only in 103, so on those versions the class is there,
    // the check passes, and the failure arrives much later as an unexplained
    // error partway through somebody's library. The format has to be asked for
    // by name, which means constructing one.
    if (!canInflate()) {
      throw new Error(
        'This browser is too old to open a zip on its own. Unzip the file first ' +
        'and use Choose folder instead, or update your browser.'
      );
    }

    const end = await guarded(findEndOfIndex(file));
    if (!end) {
      throw new Error(
        'That does not look like a .zip file, or it did not finish downloading.'
      );
    }

    const index = await guarded(upgradeToZip64(file, end));
    const entries = await guarded(readIndex(file, index));

    if (entries.length === 0) {
      throw new Error('That .zip has nothing in it.');
    }

    const files = [];
    let encryptedCount = 0;
    let unreadableCount = 0;

    for (const entry of entries) {
      if (shouldSkip(entry.name)) continue;

      if (entry.encrypted) { encryptedCount++; continue; }
      if (entry.method !== STORED && entry.method !== DEFLATED) { unreadableCount++; continue; }

      files.push(new ZipEntryFile(file, entry, entry.name));
    }

    if (encryptedCount > 0) {
      problems.push(
        formatCountPlain(encryptedCount) + ' ' + (encryptedCount === 1 ? 'file is' : 'files are') +
        ' password protected, so they were left out. Takeout exports are not password ' +
        'protected, so this zip is probably not from Takeout.'
      );
    }
    if (unreadableCount > 0) {
      problems.push(
        formatCountPlain(unreadableCount) + ' ' + (unreadableCount === 1 ? 'file was' : 'files were') +
        ' packed in a way browsers cannot open, so they were left out.'
      );
    }

    return { files: files, problems: problems };
  }


  /** Small local copy so this file does not depend on app.js loading first. */
  function formatCountPlain(number) {
    return Number(number).toLocaleString('en-GB');
  }


  // Everything this file offers. Named so it reads plainly at the call site.
  global.TakeoutZip = {
    readZip: readZip,
    // Exposed for the test page, which checks the parsing against zips it builds
    // in the browser rather than against a fixture nobody can inspect.
    _internals: {
      findEndOfIndex: findEndOfIndex,
      readIndex: readIndex,
      dosTimeToMillis: dosTimeToMillis,
      shouldSkip: shouldSkip,
      readRange: readRange,
      crc32: crc32,
      ZipEntryFile: ZipEntryFile,
      STORED: STORED,
      DEFLATED: DEFLATED,
    },
  };

})(window);
