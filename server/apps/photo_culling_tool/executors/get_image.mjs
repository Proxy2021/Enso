#!/usr/bin/env node
/**
 * get_image.mjs — Returns a base64-encoded resized thumbnail of an image.
 *
 * Accepts a file path and optional max dimension, resizes via sharp,
 * and returns the image as a base64-encoded JPEG string suitable for
 * embedding in chat UI or data URIs.
 *
 * stdin JSON:
 *   {
 *     "filePath": "/path/to/image.jpg",
 *     "maxDimension": 800,
 *     "quality": 80,
 *     "format": "jpeg"
 *   }
 *
 * stdout JSON:
 *   {
 *     "filePath": "...",
 *     "filename": "image.jpg",
 *     "base64": "<base64-string>",
 *     "mimeType": "image/jpeg",
 *     "width": 800,
 *     "height": 534,
 *     "originalWidth": 6000,
 *     "originalHeight": 4000,
 *     "sizeBytes": 45230,
 *     "dataUri": "data:image/jpeg;base64,..."
 *   }
 */

import fs from "fs/promises";
import path from "path";

async function main() {
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
      error: "Invalid JSON input: " + e.message,
      usage: '{ "filePath": "/path/to/image.jpg", "maxDimension": 800 }'
    }));
    process.exit(1);
  }

  const filePath = (input.filePath || input.path || "").trim();
  const maxDimension = typeof input.maxDimension === "number" ? input.maxDimension : 800;
  const quality = typeof input.quality === "number" ? Math.max(1, Math.min(100, input.quality)) : 80;
  const format = (input.format || "jpeg").toLowerCase();

  if (!filePath) {
    process.stdout.write(JSON.stringify({
      error: "filePath is required",
      usage: '{ "filePath": "/path/to/image.jpg" }'
    }));
    process.exit(1);
  }

  // Resolve and verify file
  const resolvedPath = filePath.startsWith("~")
    ? path.join((await import("os")).default.homedir(), filePath.slice(1))
    : path.resolve(filePath);

  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) {
      process.stdout.write(JSON.stringify({ error: `Not a file: ${resolvedPath}` }));
      process.exit(1);
    }
  } catch {
    process.stdout.write(JSON.stringify({ error: `File not found: ${resolvedPath}` }));
    process.exit(1);
  }

  // Load sharp
  let sharp;
  try {
    const mod = await import("sharp");
    sharp = mod.default || mod;
  } catch {
    process.stdout.write(JSON.stringify({
      error: "sharp package not available. Required for image processing."
    }));
    process.exit(1);
  }

  try {
    // Read original metadata first
    const metadata = await sharp(resolvedPath, { failOn: "none" }).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    // Resize and convert to output format
    let pipeline = sharp(resolvedPath, { failOn: "none" })
      .resize(maxDimension, maxDimension, { fit: "inside", withoutEnlargement: true })
      .rotate(); // Auto-rotate based on EXIF orientation

    // Apply output format
    const validFormats = ["jpeg", "png", "webp"];
    const outputFormat = validFormats.includes(format) ? format : "jpeg";

    if (outputFormat === "jpeg") {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    } else if (outputFormat === "png") {
      pipeline = pipeline.png({ compressionLevel: 6 });
    } else if (outputFormat === "webp") {
      pipeline = pipeline.webp({ quality });
    }

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    const base64 = data.toString("base64");
    const mimeType = outputFormat === "jpeg" ? "image/jpeg"
      : outputFormat === "png" ? "image/png"
      : "image/webp";

    const result = {
      filePath: resolvedPath,
      filename: path.basename(resolvedPath),
      base64,
      mimeType,
      width: info.width,
      height: info.height,
      originalWidth,
      originalHeight,
      sizeBytes: data.length,
      dataUri: `data:${mimeType};base64,${base64}`
    };

    process.stdout.write(JSON.stringify(result));
  } catch (e) {
    process.stdout.write(JSON.stringify({
      error: `Failed to process image: ${e.message}`,
      filePath: resolvedPath
    }));
    process.exit(1);
  }
}

main().catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, stack: e.stack }) + "\n");
  process.stdout.write(JSON.stringify({ error: e.message }));
  process.exit(1);
});
