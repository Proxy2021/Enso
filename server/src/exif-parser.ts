/**
 * Minimal pure-JS EXIF parser for JPEG files + dimension sniffers for PNG/GIF/WebP.
 * No external dependencies — reads raw file headers via Node.js `fs`.
 *
 * Only extracts a curated subset of tags useful for a photo gallery:
 *   camera make/model, date taken, focal length, aperture, ISO, exposure time,
 *   image dimensions, orientation, GPS coordinates.
 */

import { openSync, readSync, closeSync } from "fs";

// ── Public types ──────────────────────────────────────────────────────────

export interface ExifData {
  width?: number;
  height?: number;
  cameraMake?: string;
  cameraModel?: string;
  dateTaken?: string;
  focalLength?: string;
  aperture?: string;
  iso?: number;
  exposureTime?: string;
  orientation?: number;
  gps?: { lat: number; lng: number };
}

// ── Entry point ───────────────────────────────────────────────────────────

/**
 * Extract EXIF / dimension metadata from an image file.
 * Returns `null` if the format is unsupported or unreadable.
 * Never throws — all errors are caught internally.
 */
export function parseImageMeta(filePath: string): ExifData | null {
  try {
    const ext = filePath.toLowerCase().replace(/^.*\./, ".");
    if (ext === ".jpg" || ext === ".jpeg") return parseJpegExif(filePath);
    if (ext === ".png") return parsePngDimensions(filePath);
    if (ext === ".gif") return parseGifDimensions(filePath);
    if (ext === ".webp") return parseWebpDimensions(filePath);
    return null;
  } catch {
    return null;
  }
}

// ── JPEG EXIF ─────────────────────────────────────────────────────────────

const HEADER_SIZE = 128 * 1024; // read first 128KB — EXIF lives in the file header

function readHeader(filePath: string, size = HEADER_SIZE): Buffer {
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(size);
    const bytesRead = readSync(fd, buf, 0, size, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    closeSync(fd);
  }
}

function parseJpegExif(filePath: string): ExifData | null {
  const buf = readHeader(filePath);

  // Verify JPEG SOI marker
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  // Scan for APP1 marker (0xFFE1) containing Exif
  let offset = 2;
  while (offset + 4 < buf.length) {
    if (buf[offset] !== 0xff) break;
    const marker = buf[offset + 1];
    const segLen = buf.readUInt16BE(offset + 2);

    if (marker === 0xe1) {
      // Check "Exif\0\0" header (6 bytes after length)
      const exifHeader = buf.subarray(offset + 4, offset + 10);
      if (
        exifHeader[0] === 0x45 && // E
        exifHeader[1] === 0x78 && // x
        exifHeader[2] === 0x69 && // i
        exifHeader[3] === 0x66 && // f
        exifHeader[4] === 0x00 &&
        exifHeader[5] === 0x00
      ) {
        const tiffStart = offset + 10; // TIFF header begins here
        return parseTiff(buf, tiffStart);
      }
    }

    offset += 2 + segLen;
  }

  return null; // no EXIF APP1 found
}

// ── TIFF / IFD parsing ────────────────────────────────────────────────────

interface TiffCtx {
  buf: Buffer;
  base: number; // offset of TIFF header in buf (all IFD offsets are relative to this)
  le: boolean; // true = little-endian ("II"), false = big-endian ("MM")
}

function u16(ctx: TiffCtx, off: number): number {
  const abs = ctx.base + off;
  if (abs + 2 > ctx.buf.length) return 0;
  return ctx.le ? ctx.buf.readUInt16LE(abs) : ctx.buf.readUInt16BE(abs);
}

function u32(ctx: TiffCtx, off: number): number {
  const abs = ctx.base + off;
  if (abs + 4 > ctx.buf.length) return 0;
  return ctx.le ? ctx.buf.readUInt32LE(abs) : ctx.buf.readUInt32BE(abs);
}

function rational(ctx: TiffCtx, off: number): number {
  const num = u32(ctx, off);
  const den = u32(ctx, off + 4);
  return den === 0 ? 0 : num / den;
}

function readAscii(ctx: TiffCtx, off: number, count: number): string {
  const abs = ctx.base + off;
  if (abs + count > ctx.buf.length) return "";
  let str = "";
  for (let i = 0; i < count; i++) {
    const ch = ctx.buf[abs + i];
    if (ch === 0) break;
    str += String.fromCharCode(ch);
  }
  return str.trim();
}

/** Get the value/offset for an IFD entry. For counts >4 bytes, this is an offset into the file. */
function tagValueOffset(ctx: TiffCtx, entryOff: number): number {
  return u32(ctx, entryOff + 8);
}

function tagCount(ctx: TiffCtx, entryOff: number): number {
  return u32(ctx, entryOff + 4);
}

function tagType(ctx: TiffCtx, entryOff: number): number {
  return u16(ctx, entryOff + 2);
}

/** Read a string tag value, handling both inline (<=4 bytes) and offset cases. */
function readStringTag(ctx: TiffCtx, entryOff: number): string {
  const count = tagCount(ctx, entryOff);
  if (count <= 4) {
    // value stored inline in the value/offset field
    return readAscii(ctx, entryOff + 8, count);
  }
  const off = tagValueOffset(ctx, entryOff);
  return readAscii(ctx, off, count);
}

/** Read a rational tag value. */
function readRationalTag(ctx: TiffCtx, entryOff: number): number {
  const off = tagValueOffset(ctx, entryOff);
  return rational(ctx, off);
}

/** Read a SHORT or LONG value (inline). */
function readNumericTag(ctx: TiffCtx, entryOff: number): number {
  const typ = tagType(ctx, entryOff);
  if (typ === 3) return u16(ctx, entryOff + 8); // SHORT
  if (typ === 4) return u32(ctx, entryOff + 8); // LONG
  return u16(ctx, entryOff + 8); // fallback
}

function parseTiff(buf: Buffer, base: number): ExifData | null {
  if (base + 8 > buf.length) return null;

  // Byte order
  const bo = buf.readUInt16BE(base);
  const le = bo === 0x4949; // "II" = little-endian
  if (!le && bo !== 0x4d4d) return null; // must be "II" or "MM"

  const ctx: TiffCtx = { buf, base, le };

  // Verify TIFF magic (42)
  if (u16(ctx, 2) !== 42) return null;

  // IFD0 offset
  const ifd0Off = u32(ctx, 4);
  if (ifd0Off === 0) return null;

  const result: ExifData = {};

  // Parse IFD0
  let exifIfdOff = 0;
  let gpsIfdOff = 0;

  const ifd0Count = u16(ctx, ifd0Off);
  for (let i = 0; i < ifd0Count; i++) {
    const entryOff = ifd0Off + 2 + i * 12;
    const tag = u16(ctx, entryOff);

    switch (tag) {
      case 0x010f: // Make
        result.cameraMake = readStringTag(ctx, entryOff);
        break;
      case 0x0110: // Model
        result.cameraModel = readStringTag(ctx, entryOff);
        break;
      case 0x0112: // Orientation
        result.orientation = readNumericTag(ctx, entryOff);
        break;
      case 0x8769: // ExifIFD pointer
        exifIfdOff = tagValueOffset(ctx, entryOff);
        break;
      case 0x8825: // GPS IFD pointer
        gpsIfdOff = tagValueOffset(ctx, entryOff);
        break;
      case 0xa002: // PixelXDimension (sometimes in IFD0)
        result.width = readNumericTag(ctx, entryOff);
        break;
      case 0xa003: // PixelYDimension
        result.height = readNumericTag(ctx, entryOff);
        break;
    }
  }

  // Parse ExifIFD
  if (exifIfdOff > 0 && ctx.base + exifIfdOff + 2 < buf.length) {
    const exifCount = u16(ctx, exifIfdOff);
    for (let i = 0; i < exifCount; i++) {
      const entryOff = exifIfdOff + 2 + i * 12;
      if (ctx.base + entryOff + 12 > buf.length) break;
      const tag = u16(ctx, entryOff);

      switch (tag) {
        case 0x9003: // DateTimeOriginal
          result.dateTaken = readStringTag(ctx, entryOff);
          break;
        case 0x829a: { // ExposureTime
          const val = readRationalTag(ctx, entryOff);
          if (val > 0 && val < 1) {
            result.exposureTime = `1/${Math.round(1 / val)}`;
          } else if (val > 0) {
            result.exposureTime = `${val}s`;
          }
          break;
        }
        case 0x829d: { // FNumber
          const fnum = readRationalTag(ctx, entryOff);
          if (fnum > 0) result.aperture = `f/${fnum.toFixed(1)}`;
          break;
        }
        case 0x8827: // ISOSpeedRatings
          result.iso = readNumericTag(ctx, entryOff);
          break;
        case 0x920a: { // FocalLength
          const fl = readRationalTag(ctx, entryOff);
          if (fl > 0) result.focalLength = `${fl.toFixed(fl % 1 === 0 ? 0 : 1)}mm`;
          break;
        }
        case 0xa002: // PixelXDimension
          result.width = readNumericTag(ctx, entryOff);
          break;
        case 0xa003: // PixelYDimension
          result.height = readNumericTag(ctx, entryOff);
          break;
      }
    }
  }

  // Parse GPS IFD
  if (gpsIfdOff > 0 && ctx.base + gpsIfdOff + 2 < buf.length) {
    result.gps = parseGpsIfd(ctx, gpsIfdOff);
  }

  return result;
}

function parseGpsIfd(ctx: TiffCtx, ifdOff: number): { lat: number; lng: number } | undefined {
  const count = u16(ctx, ifdOff);
  let latRef = "";
  let lngRef = "";
  let latVals: number[] = [];
  let lngVals: number[] = [];

  for (let i = 0; i < count; i++) {
    const entryOff = ifdOff + 2 + i * 12;
    if (ctx.base + entryOff + 12 > ctx.buf.length) break;
    const tag = u16(ctx, entryOff);

    switch (tag) {
      case 0x0001: // GPSLatitudeRef
        latRef = readStringTag(ctx, entryOff);
        break;
      case 0x0002: { // GPSLatitude (3 rationals: degrees, minutes, seconds)
        const off = tagValueOffset(ctx, entryOff);
        latVals = [rational(ctx, off), rational(ctx, off + 8), rational(ctx, off + 16)];
        break;
      }
      case 0x0003: // GPSLongitudeRef
        lngRef = readStringTag(ctx, entryOff);
        break;
      case 0x0004: { // GPSLongitude
        const off = tagValueOffset(ctx, entryOff);
        lngVals = [rational(ctx, off), rational(ctx, off + 8), rational(ctx, off + 16)];
        break;
      }
    }
  }

  if (latVals.length === 3 && lngVals.length === 3) {
    let lat = latVals[0] + latVals[1] / 60 + latVals[2] / 3600;
    let lng = lngVals[0] + lngVals[1] / 60 + lngVals[2] / 3600;
    if (latRef === "S") lat = -lat;
    if (lngRef === "W") lng = -lng;
    if (isFinite(lat) && isFinite(lng) && (lat !== 0 || lng !== 0)) {
      return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
    }
  }
  return undefined;
}

// ── PNG dimensions ────────────────────────────────────────────────────────

function parsePngDimensions(filePath: string): ExifData | null {
  const buf = readHeader(filePath, 32);
  // PNG signature: 137 80 78 71 13 10 26 10
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
  // IHDR chunk starts at byte 16 (after 8-byte sig + 4-byte length + 4-byte type)
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

// ── GIF dimensions ────────────────────────────────────────────────────────

function parseGifDimensions(filePath: string): ExifData | null {
  const buf = readHeader(filePath, 16);
  // GIF89a or GIF87a header
  if (buf.length < 10) return null;
  if (buf[0] !== 0x47 || buf[1] !== 0x49 || buf[2] !== 0x46) return null;
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  return { width, height };
}

// ── WebP dimensions ───────────────────────────────────────────────────────

function parseWebpDimensions(filePath: string): ExifData | null {
  const buf = readHeader(filePath, 64);
  // RIFF....WEBP header
  if (buf.length < 30) return null;
  if (buf[0] !== 0x52 || buf[1] !== 0x49 || buf[2] !== 0x46 || buf[3] !== 0x46) return null;
  if (buf[8] !== 0x57 || buf[9] !== 0x45 || buf[10] !== 0x42 || buf[11] !== 0x50) return null;

  // Check for VP8 chunk
  const chunkId = buf.subarray(12, 16).toString("ascii");

  if (chunkId === "VP8 ") {
    // Lossy WebP: dimensions at byte 26-29 (little-endian, 14-bit values)
    if (buf.length < 30) return null;
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }

  if (chunkId === "VP8L") {
    // Lossless WebP: dimensions encoded in first 4 bytes of bitstream
    if (buf.length < 25) return null;
    // Skip signature byte (0x2f) at offset 21
    const bits = buf.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }

  if (chunkId === "VP8X") {
    // Extended WebP: canvas size at offset 24-29 (3 bytes each, little-endian + 1)
    if (buf.length < 30) return null;
    const width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
    const height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
    return { width, height };
  }

  return null;
}
