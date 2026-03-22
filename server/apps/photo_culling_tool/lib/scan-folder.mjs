/**
 * scan-folder.mjs — Scans a directory for image files and extracts EXIF metadata.
 *
 * Discovers JPEG, PNG, HEIC, TIFF, and RAW variants (CR2, CR3, NEF, ARW, RAF, ORF, DNG, RW2).
 * Extracts EXIF data using the exifr library for lightweight, dependency-free metadata reading.
 *
 * Usage:
 *   import { scanFolder } from './scan-folder.mjs';
 *   const result = await scanFolder('/path/to/shoot', { onProgress });
 *
 * @module scan-folder
 */

import fs from "fs/promises";
import path from "path";

// Supported image extensions (lowercase, with leading dot)
const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".heic", ".heif",
  ".tiff", ".tif",
  ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"
]);

// Extensions that sharp can process directly for sharpness/pHash
const SHARP_NATIVE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".heic", ".heif"
]);

// RAW extensions that need embedded JPEG preview extraction
const RAW_EXTENSIONS = new Set([
  ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"
]);

/**
 * Recursively discover all image files in a folder.
 *
 * @param {string} folderPath - Absolute path to scan
 * @param {object} [options]
 * @param {boolean} [options.recursive=true] - Scan subdirectories
 * @param {function} [options.onProgress] - Progress callback: ({ current, total, file, stage })
 * @returns {Promise<Array<{path: string, filename: string, ext: string, isRaw: boolean, sizeBytes: number}>>}
 */
export async function discoverImages(folderPath, options = {}) {
  const { recursive = true, onProgress } = options;

  if (!folderPath || typeof folderPath !== "string") {
    throw new Error("folderPath is required and must be a string");
  }

  // Verify folder exists
  let stat;
  try {
    stat = await fs.stat(folderPath);
  } catch (e) {
    throw new Error(`Folder not found: ${folderPath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${folderPath}`);
  }

  const images = [];
  await walkDirectory(folderPath, images, recursive);

  // Sort by filename for deterministic ordering
  images.sort((a, b) => a.filename.localeCompare(b.filename));

  if (onProgress) {
    onProgress({
      stage: "discovery",
      stageNumber: 1,
      totalStages: 7,
      current: images.length,
      total: images.length,
      percent: 5,
      message: `Found ${images.length} image files`
    });
  }

  return images;
}

/**
 * Recursively walk a directory and collect image files.
 */
async function walkDirectory(dirPath, results, recursive) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (e) {
    // Skip directories we can't read (permissions, etc.)
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory() && recursive) {
      // Skip hidden directories and common non-image directories
      if (!entry.name.startsWith(".") && entry.name !== "_rejected" && entry.name !== "node_modules") {
        await walkDirectory(fullPath, results, recursive);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        let fileStat;
        try {
          fileStat = await fs.stat(fullPath);
        } catch {
          continue;
        }
        results.push({
          path: fullPath,
          filename: entry.name,
          ext: ext,
          isRaw: RAW_EXTENSIONS.has(ext),
          isSharpNative: SHARP_NATIVE_EXTENSIONS.has(ext),
          sizeBytes: fileStat.size
        });
      }
    }
  }
}

/**
 * Extract EXIF metadata from a list of image files using exifr.
 *
 * @param {Array<{path: string, filename: string, ext: string}>} images - Image file list from discoverImages()
 * @param {object} [options]
 * @param {number} [options.concurrency=8] - Max concurrent EXIF reads
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<Array<object>>} - Images enriched with .exif property
 */
export async function extractExif(images, options = {}) {
  const { concurrency = 8, onProgress } = options;

  // Lazy-load exifr to avoid hard dependency at import time
  let exifr;
  try {
    exifr = await import("exifr");
  } catch (e) {
    throw new Error("exifr package not found. Install with: npm install exifr");
  }

  const total = images.length;
  let completed = 0;

  // Process in batches for controlled concurrency
  const results = [];
  for (let i = 0; i < total; i += concurrency) {
    const batch = images.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (img) => {
        const exifData = await readExifSafe(exifr, img.path);
        completed++;

        if (onProgress) {
          const overallPercent = 5 + Math.round((completed / total) * 15);
          onProgress({
            stage: "exif",
            stageNumber: 2,
            totalStages: 7,
            current: completed,
            total,
            percent: overallPercent,
            message: `Reading EXIF... ${completed}/${total}`
          });
        }

        return {
          ...img,
          exif: exifData
        };
      })
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Safely read EXIF from a single file, returning a normalized object.
 */
async function readExifSafe(exifr, filePath) {
  try {
    const raw = await exifr.parse(filePath, {
      // Request specific tags we care about
      pick: [
        "DateTimeOriginal", "SubSecTimeOriginal", "CreateDate", "SubSecTime",
        "Make", "Model", "ISO", "ExposureTime", "FNumber", "FocalLength",
        "ExposureCompensation", "WhiteBalance", "Flash",
        "ImageWidth", "ImageHeight", "ExifImageWidth", "ExifImageHeight",
        "Orientation"
      ]
    });

    if (!raw) return buildEmptyExif();

    // Normalize date — prefer DateTimeOriginal, fall back to CreateDate
    const dateRaw = raw.DateTimeOriginal || raw.CreateDate;
    const subSec = raw.SubSecTimeOriginal || raw.SubSecTime || "";
    let dateTaken = null;
    let dateTakenMs = null;

    if (dateRaw instanceof Date) {
      dateTaken = dateRaw.toISOString();
      dateTakenMs = dateRaw.getTime();
      // Add subsecond precision
      if (subSec) {
        const fraction = parseFloat("0." + subSec);
        if (!isNaN(fraction)) {
          dateTakenMs += fraction * 1000;
        }
      }
    }

    return {
      cameraMake: raw.Make || null,
      cameraModel: raw.Model || null,
      dateTaken,
      dateTakenMs,
      subSecTime: subSec || null,
      iso: raw.ISO || null,
      shutterSpeed: raw.ExposureTime ? formatShutterSpeed(raw.ExposureTime) : null,
      aperture: raw.FNumber ? `f/${raw.FNumber}` : null,
      focalLength: raw.FocalLength ? `${raw.FocalLength}mm` : null,
      exposureComp: raw.ExposureCompensation != null ? `${raw.ExposureCompensation > 0 ? "+" : ""}${raw.ExposureCompensation}` : null,
      whiteBalance: raw.WhiteBalance || null,
      flash: raw.Flash != null ? !!(raw.Flash & 1) : null,
      width: raw.ExifImageWidth || raw.ImageWidth || null,
      height: raw.ExifImageHeight || raw.ImageHeight || null,
      orientation: raw.Orientation || 1
    };
  } catch (e) {
    // EXIF read failed — return empty metadata (don't crash the pipeline)
    return buildEmptyExif();
  }
}

function buildEmptyExif() {
  return {
    cameraMake: null, cameraModel: null, dateTaken: null, dateTakenMs: null,
    subSecTime: null, iso: null, shutterSpeed: null, aperture: null,
    focalLength: null, exposureComp: null, whiteBalance: null, flash: null,
    width: null, height: null, orientation: 1
  };
}

function formatShutterSpeed(exposureTime) {
  if (exposureTime >= 1) return `${exposureTime}s`;
  const denom = Math.round(1 / exposureTime);
  return `1/${denom}s`;
}

/**
 * Full scan pipeline: discover + extract EXIF.
 *
 * @param {string} folderPath - Absolute path to scan
 * @param {object} [options]
 * @param {boolean} [options.recursive=true] - Scan subdirectories
 * @param {number} [options.concurrency=8] - EXIF read concurrency
 * @param {function} [options.onProgress] - Progress callback
 * @returns {Promise<{images: Array, folderPath: string, totalImages: number}>}
 */
export async function scanFolder(folderPath, options = {}) {
  const { recursive = true, concurrency = 8, onProgress } = options;

  // Stage 1: Discover
  const discovered = await discoverImages(folderPath, { recursive, onProgress });

  if (discovered.length === 0) {
    return {
      folderPath,
      totalImages: 0,
      images: [],
      message: "No image files found in folder"
    };
  }

  // Stage 2: EXIF
  const withExif = await extractExif(discovered, { concurrency, onProgress });

  return {
    folderPath,
    totalImages: withExif.length,
    images: withExif
  };
}

export default scanFolder;
