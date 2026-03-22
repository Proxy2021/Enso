# Photo Culling Tool — Executor Reference

## Canonical Executors (match app.json tool suffixes)

| File | Tool Suffix | Purpose |
|------|-------------|---------|
| `scan_folder.js` | `scan_folder` | Full pipeline: discover images, EXIF, sharpness, face detection, burst grouping, ranking |
| `analyze_images.js` | `analyze_images` | Re-analyze with updated thresholds, pHash similarity grouping |
| `review_session.js` | `review_session` | Combined review + navigate + decide with undo |
| `export_selections.js` | `export_selections` | Export approved photos, write sidecars, CSV manifest |
| `load_session.js` | `load_session` | Resume saved session from disk |

## Dependencies

- **sharp** (required) — Laplacian variance sharpness, pHash computation
- **exifr** (required) — EXIF metadata extraction
- **@vladmandic/face-api** (optional) — Face detection + eyes-closed via EAR
- **@tensorflow/tfjs-node** (optional) — TF backend for face-api
