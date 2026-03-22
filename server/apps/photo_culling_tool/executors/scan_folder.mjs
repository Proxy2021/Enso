#!/usr/bin/env node
/**
 * scan_folder.mjs — Discover image files, read EXIF metadata, and group into bursts.
 *
 * This is Stage 1 of the photo culling pipeline: Discovery + EXIF + Burst Grouping.
 * It does NOT compute sharpness or detect faces — those are handled by analyze_images.mjs.
 *
 * stdin JSON:
 *   {
 *     "folderPath": "/path/to/shoot",
 *     "recursive": true,
 *     "concurrency": 8,
 *     "burstThresholdMs": 2000,
 *     "extensions": [".jpg", ".jpeg", ".png", ".webp"]
 *   }
 *
 * stdout JSON:
 *   {
 *     "images": [{ path, filename, ext, isRaw, sizeBytes, timestamp, exif, groupId }],
 *     "groups": [{ groupId, captureTime, groupType, imageCount, imageIndices }],
 *     "stats": { totalImages, totalGroups, withExif, withoutExif },
 *     "folderPath": "...",
 *     "elapsedMs": N,
 *     "message": "..."
 *   }
 *
 * Progress reported to stderr as JSON lines:
 *   { "stage": "...", "current": N, "total": N, "percent": N, "message": "..." }
 */

import fs from "fs/promises";
import path from "path";
import os from "os";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp",
  ".heic", ".heif", ".tiff", ".tif",
  ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"
]);

const RAW_EXTENSIONS = new Set([
  ".cr2", ".cr3", ".nef", ".arw", ".raf", ".orf", ".dng", ".rw2"
]);

const SKIP_DIRS = new Set([
  "node_modules", "_rejected", "_approved", ".culling-cache", ".enso-thumbnails"
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function progress(data) {
  process.stderr.write(JSON.stringify(data) + "\n");
}

function buildEmptyExif() {
  return {
    cameraMake: null, cameraModel: null,
    dateTaken: null, dateTakenMs: null, subSecTime: null,
    iso: null, shutterSpeed: null, aperture: null,
    focalLength: null, exposureComp: null, whiteBalance: null, flash: null,
    width: null, height: null, orientation: 1
  };
}

function resolvePath(inputPath) {
  if (inputPath.startsWith("~")) {
    return path.join(os.homedir(), inputPath.slice(1));
  }
  return path.resolve(inputPath);
}

// ---------------------------------------------------------------------------
// Stage 1: Discover image files
// ---------------------------------------------------------------------------

async function discoverImages(folderPath, recursive, allowedExtensions) {
  const results = [];
  await walk(folderPath, results, recursive, allowedExtensions);
  results.sort((a, b) => a.filename.localeCompare(b.filename));
  return results;
}

async function walk(dirPath, results, recursive, allowedExtensions) {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return; // Skip unreadable directories
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory() && recursive) {
      if (!entry.name.startsWith(".") && !SKIP_DIRS.has(entry.name)) {
        await walk(fullPath, results, recursive, allowedExtensions);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (allowedExtensions.has(ext)) {
        let fileStat;
        try {
          fileStat = await fs.stat(fullPath);
        } catch {
          continue;
        }
        results.push({
          path: fullPath,
          filename: entry.name,
          ext,
          isRaw: RAW_EXTENSIONS.has(ext),
          sizeBytes: fileStat.size
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
    progress({
      stage: "exif", current: 0, total: images.length, percent: 5,
      message: "exifr not installed — skipping EXIF extraction"
    });
    return images.map((img) => ({ ...img, exif: buildEmptyExif(), timestamp: null }));
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
            stage: "exif", current: completed, total,
            percent: 5 + Math.round((completed / total) * 25),
            message: `Reading EXIF... ${completed}/${total}`
          });
        }
        return {
          ...img,
          exif: exifData,
          timestamp: exifData.dateTakenMs || null
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
      dateTaken, dateTakenMs,
      subSecTime: subSec || null,
      iso: raw.ISO || null,
      shutterSpeed: raw.ExposureTime
        ? raw.ExposureTime >= 1 ? `${raw.ExposureTime}s` : `1/${Math.round(1 / raw.ExposureTime)}s`
        : null,
      aperture: raw.FNumber ? `f/${raw.FNumber}` : null,
      focalLength: raw.FocalLength ? `${raw.FocalLength}mm` : null,
      exposureComp: raw.ExposureCompensation != null
        ? `${raw.ExposureCompensation > 0 ? "+" : ""}${raw.ExposureCompensation}` : null,
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

// ---------------------------------------------------------------------------
// Stage 3: Group by timestamp proximity (burst detection)
// ---------------------------------------------------------------------------

function groupIntoBursts(images, burstThresholdMs) {
  if (images.length === 0) return { images: [], groups: [] };

  // Sort by capture timestamp (nulls go to end)
  const sorted = [...images].sort((a, b) => {
    const ta = a.exif.dateTakenMs;
    const tb = b.exif.dateTakenMs;
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });

  const rawGroups = [];
  let current = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const tPrev = sorted[i - 1].exif.dateTakenMs;
    const tCurr = sorted[i].exif.dateTakenMs;
    const gap = (tPrev != null && tCurr != null) ? Math.abs(tCurr - tPrev) : Infinity;

    if (gap <= burstThresholdMs) {
      current.push(sorted[i]);
    } else {
      rawGroups.push(current);
      current = [sorted[i]];
    }
  }
  rawGroups.push(current);

  // Assign groupId to each image and build group metadata
  const groups = [];
  const allImages = [];

  for (let gi = 0; gi < rawGroups.length; gi++) {
    const grp = rawGroups[gi];
    const groupId = `G${String(gi + 1).padStart(3, "0")}`;

    // Determine group type
    let groupType = "single";
    if (grp.length > 1) {
      const firstTs = grp[0].exif.dateTakenMs;
      const lastTs = grp[grp.length - 1].exif.dateTakenMs;
      groupType = (firstTs != null && lastTs != null && Math.abs(lastTs - firstTs) < 2000)
        ? "burst" : "similar";
    }

    // Earliest capture time for the group
    let captureTime = null;
    for (const img of grp) {
      if (img.exif.dateTaken) { captureTime = img.exif.dateTaken; break; }
    }

    const imageIndices = [];
    for (const img of grp) {
      const tagged = { ...img, groupId };
      imageIndices.push(allImages.length);
      allImages.push(tagged);
    }

    groups.push({
      groupId,
      captureTime,
      groupType,
      imageCount: grp.length,
      imageIndices
    });
  }

  return { images: allImages, groups };
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

  const folderPathRaw = (input.folderPath || "").trim();
  const recursive = input.recursive !== false;
  const concurrency = typeof input.concurrency === "number" ? Math.max(1, input.concurrency) : 8;
  const burstThresholdMs = typeof input.burstThresholdMs === "number" ? input.burstThresholdMs : 2000;

  // Build allowed extensions set from input or defaults
  let allowedExtensions = DEFAULT_IMAGE_EXTENSIONS;
  if (Array.isArray(input.extensions) && input.extensions.length > 0) {
    allowedExtensions = new Set(
      input.extensions.map((e) => e.toLowerCase().startsWith(".") ? e.toLowerCase() : "." + e.toLowerCase())
    );
  }

  if (!folderPathRaw) {
    process.stdout.write(JSON.stringify({
      error: "folderPath is required",
      usage: '{ "folderPath": "/path/to/photos" }'
    }));
    process.exit(1);
  }

  const folderPath = resolvePath(folderPathRaw);

  // Verify folder exists
  try {
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) {
      process.stdout.write(JSON.stringify({ error: `Not a directory: ${folderPath}` }));
      process.exit(1);
    }
  } catch {
    process.stdout.write(JSON.stringify({ error: `Folder not found: ${folderPath}` }));
    process.exit(1);
  }

  // Stage 1: Discover image files
  progress({ stage: "discovery", current: 0, total: 0, percent: 2, message: "Scanning folder..." });
  const discovered = await discoverImages(folderPath, recursive, allowedExtensions);

  if (discovered.length === 0) {
    const elapsedMs = Date.now() - startMs;
    process.stdout.write(JSON.stringify({
      images: [],
      groups: [],
      stats: { totalImages: 0, totalGroups: 0, withExif: 0, withoutExif: 0 },
      folderPath,
      elapsedMs,
      message: "No image files found in folder"
    }));
    return;
  }

  progress({
    stage: "discovery", current: discovered.length, total: discovered.length,
    percent: 5, message: `Found ${discovered.length} image files`
  });

  // Stage 2: EXIF extraction
  const withExif = await extractExif(discovered, concurrency);

  // Count EXIF stats
  let withExifCount = 0;
  let withoutExifCount = 0;
  for (const img of withExif) {
    if (img.exif.dateTakenMs != null) withExifCount++;
    else withoutExifCount++;
  }

  // Stage 3: Burst grouping by timestamp
  progress({ stage: "grouping", current: 0, total: 0, percent: 35, message: "Grouping bursts..." });
  const { images: groupedImages, groups } = groupIntoBursts(withExif, burstThresholdMs);

  progress({
    stage: "grouping", current: groups.length, total: groups.length,
    percent: 40, message: `Grouped ${groupedImages.length} images into ${groups.length} groups`
  });

  const elapsedMs = Date.now() - startMs;
  const message = `Scanned ${groupedImages.length} images into ${groups.length} groups ` +
    `(${withExifCount} with EXIF, ${withoutExifCount} without) in ${elapsedMs}ms`;

  progress({ stage: "complete", current: groupedImages.length, total: groupedImages.length,
    percent: 100, message });

  process.stdout.write(JSON.stringify({
    images: groupedImages,
    groups,
    stats: {
      totalImages: groupedImages.length,
      totalGroups: groups.length,
      withExif: withExifCount,
      withoutExif: withoutExifCount
    },
    folderPath,
    burstThresholdMs,
    elapsedMs,
    message
  }));
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message }));
  process.exit(1);
});
