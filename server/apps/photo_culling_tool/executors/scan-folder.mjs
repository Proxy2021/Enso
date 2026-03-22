#!/usr/bin/env node
/**
 * scan-folder.mjs — Recursively scans a folder for image files and extracts EXIF metadata.
 *
 * Discovers .jpg/.jpeg/.png/.raw/.cr2/.nef (and other RAW) files recursively.
 * Extracts EXIF (timestamp, camera model, ISO, shutter speed) using exifr.
 *
 * stdin JSON:
 *   { "folderPath": "/path/to/shoot", "recursive": true, "concurrency": 8 }
 *
 * stdout JSON:
 *   { "images": [{ id, path, filename, timestamp, exif }], "folderPath": "...", "totalImages": N, "elapsedMs": N }
 *
 * Progress is reported to stderr as JSON lines.
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".heic", ".heif",
  ".tiff", ".tif",
  ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"
]);

const RAW_EXTENSIONS = new Set([
  ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"
]);

const SHARP_NATIVE = new Set([
  ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".heic", ".heif"
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function progress(data) {
  try {
    process.stderr.write(JSON.stringify(data) + "\n");
  } catch {
    // stderr write failed — non-fatal
  }
}

function generateId(filePath) {
  return crypto.createHash("md5").update(filePath).digest("hex").slice(0, 12);
}

// ---------------------------------------------------------------------------
// Stage 1: Discover image files
// ---------------------------------------------------------------------------

async function discoverImages(folderPath, recursive) {
  const results = [];
  await walk(folderPath, results, recursive);
  results.sort((a, b) => a.filename.localeCompare(b.filename));
  return results;
}

async function walk(dirPath, results, recursive) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return; // skip unreadable dirs
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory() && recursive) {
      if (
        !entry.name.startsWith(".") &&
        entry.name !== "_rejected" &&
        entry.name !== "node_modules" &&
        entry.name !== ".culling-cache"
      ) {
        await walk(fullPath, results, recursive);
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
          id: generateId(fullPath),
          path: fullPath,
          filename: entry.name,
          ext,
          isRaw: RAW_EXTENSIONS.has(ext),
          isSharpNative: SHARP_NATIVE.has(ext),
          sizeBytes: fileStat.size,
          mtime: fileStat.mtime.toISOString()
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 2: Extract EXIF metadata
// ---------------------------------------------------------------------------

async function extractExif(images, concurrency) {
  let exifr;
  try {
    exifr = await import("exifr");
  } catch {
    // exifr not available — return images with empty EXIF
    progress({ stage: "exif", current: 0, total: images.length, percent: 10, message: "exifr not installed — skipping EXIF extraction" });
    return images.map((img) => ({
      ...img,
      timestamp: null,
      exif: buildEmptyExif()
    }));
  }

  const total = images.length;
  const results = [];

  for (let i = 0; i < total; i += concurrency) {
    const batch = images.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (img, batchIdx) => {
        const exifData = await readExifSafe(exifr, img.path);
        const completed = i + batchIdx + 1;
        if (completed % 10 === 0 || completed === total) {
          progress({
            stage: "exif",
            current: completed,
            total,
            percent: 10 + Math.round((completed / total) * 80),
            message: `Reading EXIF... ${completed}/${total}`
          });
        }
        return {
          ...img,
          timestamp: exifData.dateTaken,
          exif: exifData
        };
      })
    );
    results.push(...batchResults);
  }

  return results;
}

async function readExifSafe(exifr, filePath) {
  try {
    const raw = await exifr.parse(filePath, {
      pick: [
        "DateTimeOriginal", "SubSecTimeOriginal", "CreateDate", "SubSecTime",
        "Make", "Model", "ISO", "ExposureTime", "FNumber", "FocalLength",
        "ExposureCompensation", "WhiteBalance", "Flash",
        "ImageWidth", "ImageHeight", "ExifImageWidth", "ExifImageHeight",
        "Orientation"
      ]
    });

    if (!raw) return buildEmptyExif();

    const dateRaw = raw.DateTimeOriginal || raw.CreateDate;
    const subSec = raw.SubSecTimeOriginal || raw.SubSecTime || "";
    let dateTaken = null;
    let dateTakenMs = null;

    if (dateRaw instanceof Date) {
      dateTaken = dateRaw.toISOString();
      dateTakenMs = dateRaw.getTime();
      if (subSec) {
        const fraction = parseFloat("0." + subSec);
        if (!isNaN(fraction)) dateTakenMs += fraction * 1000;
      }
    }

    return {
      cameraMake: raw.Make || null,
      cameraModel: raw.Model || null,
      dateTaken,
      dateTakenMs,
      subSecTime: subSec || null,
      iso: raw.ISO || null,
      shutterSpeed: raw.ExposureTime
        ? raw.ExposureTime >= 1
          ? `${raw.ExposureTime}s`
          : `1/${Math.round(1 / raw.ExposureTime)}s`
        : null,
      aperture: raw.FNumber ? `f/${raw.FNumber}` : null,
      focalLength: raw.FocalLength ? `${raw.FocalLength}mm` : null,
      exposureComp: raw.ExposureCompensation != null
        ? `${raw.ExposureCompensation > 0 ? "+" : ""}${raw.ExposureCompensation}`
        : null,
      whiteBalance: raw.WhiteBalance || null,
      flash: raw.Flash != null ? !!(raw.Flash & 1) : null,
      width: raw.ExifImageWidth || raw.ImageWidth || null,
      height: raw.ExifImageHeight || raw.ImageHeight || null,
      orientation: raw.Orientation || 1
    };
  } catch {
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startMs = Date.now();

  // Read input from stdin
  let input;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf-8").trim();
    input = raw ? JSON.parse(raw) : {};
  } catch (e) {
    process.stdout.write(JSON.stringify({
      error: "Invalid JSON input on stdin: " + e.message,
      usage: '{ "folderPath": "/path/to/photos" }'
    }));
    process.exit(1);
  }

  const folderPath = (input.folderPath || "").trim();
  const recursive = input.recursive !== false;
  const concurrency = typeof input.concurrency === "number" ? input.concurrency : 8;

  if (!folderPath) {
    process.stdout.write(JSON.stringify({
      error: "folderPath is required",
      usage: '{ "folderPath": "/path/to/photos" }'
    }));
    process.exit(1);
  }

  // Resolve home directory
  const resolvedPath = folderPath.startsWith("~")
    ? path.join((await import("os")).default.homedir(), folderPath.slice(1))
    : folderPath;

  // Verify folder exists
  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isDirectory()) {
      process.stdout.write(JSON.stringify({ error: `Not a directory: ${resolvedPath}` }));
      process.exit(1);
    }
  } catch {
    process.stdout.write(JSON.stringify({ error: `Folder not found: ${resolvedPath}` }));
    process.exit(1);
  }

  // Stage 1: Discover
  progress({ stage: "discovery", current: 0, total: 0, percent: 5, message: "Scanning folder..." });
  const discovered = await discoverImages(resolvedPath, recursive);

  if (discovered.length === 0) {
    process.stdout.write(JSON.stringify({
      folderPath: resolvedPath,
      totalImages: 0,
      images: [],
      elapsedMs: Date.now() - startMs,
      message: "No image files found in folder"
    }));
    return;
  }

  progress({
    stage: "discovery",
    current: discovered.length,
    total: discovered.length,
    percent: 10,
    message: `Found ${discovered.length} image files`
  });

  // Stage 2: EXIF extraction
  const withExif = await extractExif(discovered, concurrency);

  const elapsedMs = Date.now() - startMs;

  progress({
    stage: "complete",
    current: withExif.length,
    total: withExif.length,
    percent: 100,
    message: `Scan complete: ${withExif.length} images in ${elapsedMs}ms`
  });

  // Output result — matches contract: { images: [{id, path, filename, timestamp, exif}] }
  const result = {
    folderPath: resolvedPath,
    totalImages: withExif.length,
    images: withExif,
    elapsedMs,
    message: `Scanned ${withExif.length} images from ${resolvedPath}`
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message }));
  process.exit(1);
});
