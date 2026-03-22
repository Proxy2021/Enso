---
name: client_gallery
description: "Client gallery delivery tool with AI-generated captions, dual-resolution downloads, and download tracking analytics"
---

Build a REUSABLE, GENERAL-PURPOSE registered Enso app (app family: 'client_gallery') for delivering photo galleries to clients with AI captions and download tracking. This is a repeated-use tool — create a full app with app.json + template.jsx + executors/. Study server/apps/media_gallery/ as the gold standard.

The app must have at least 6 tools:
1. **create_gallery** — create a new gallery (name, client name, event/theme description, optional cover photo URL)
2. **add_photos** — add photos to a gallery (gallery ID, array of photo objects with URL and optional filename/notes)
3. **generate_captions** — call Claude API to generate AI captions for all uncaptioned photos in a gallery; use the gallery's event/theme as context; captions should be 1-2 sentences, evocative and professional
4. **edit_caption** — manually edit or override a caption for a specific photo
5. **get_gallery_page** — render the full client-facing gallery page as HTML/JSX showing all photos with captions and download buttons for web-res and print-res
6. **record_download** — log a download event (gallery ID, photo ID, resolution type: 'web'|'print', client name, timestamp)
7. **get_download_stats** — show download analytics: which photos downloaded most, by whom, web vs print breakdown, total downloads per gallery

UI views in template.jsx:
- **Gallery List**: all galleries with status, photo count, total downloads
- **Gallery Editor**: photo grid with captions, regenerate caption buttons, add photos
- **Preview**: simulated client gallery page with photos, AI captions, download buttons
- **Analytics**: download stats dashboard with per-photo and per-client breakdowns

All data stored in app state (no external DB). Photo URLs are passed in by the user — no file upload infrastructure needed. Web-res downloads link to the original URL with a note about resolution; print-res links to original. Track downloads in state. Use Claude API (claude-haiku-4-5-20251001) for caption generation via the generate_captions tool executor. Parameterize everything — no hardcoded gallery names, client names, or photo URLs.

## Tool Reference

### enso_client_gallery_create_gallery (primary)

Create a new client gallery with a name, client name, event/theme description, and optional cover photo URL. Use when the user says: 'create a gallery', 'new client gallery', 'set up a gallery for delivery', 'make a photo gallery'.

Parameters:
- `name` (string): Gallery name/title (e.g. 'Sarah & James Wedding')
- `clientName` (string): Client's name
- `description` (string): Event or theme description for AI caption context
- `coverPhotoUrl` (string): Optional URL for the gallery cover photo

### enso_client_gallery_add_photos

Add photos to an existing gallery by providing photo URLs and optional filenames/notes. Use when the user says: 'add photos to gallery', 'upload images to gallery', 'put these photos in the gallery'.

Parameters:
- `galleryId` (string): ID of the target gallery
- `photos` (array): Array of photo objects with url, optional filename, and optional notes

### enso_client_gallery_generate_captions

Generate AI captions for all uncaptioned photos in a gallery using the event/theme as context. Captions are 1-2 sentences, evocative and professional. Use when the user says: 'generate captions', 'write descriptions for photos', 'AI describe my gallery photos', 'caption my gallery'.

Parameters:
- `galleryId` (string): ID of the target gallery
- `style` (string): Caption style: elegant, storytelling, minimal, or descriptive (default: elegant)
- `regenerateAll` (boolean): If true, regenerate all captions including previously generated ones (default: false)

### enso_client_gallery_edit_caption

Manually edit or override the caption for a specific photo in a gallery. Use when the user says: 'edit this caption', 'change photo description', 'update the caption', 'rewrite this caption'.

Parameters:
- `galleryId` (string): ID of the target gallery
- `photoId` (string): ID of the photo to edit the caption for
- `caption` (string): New caption text

### enso_client_gallery_get_gallery_page

Render the full client-facing gallery page showing all photos with AI captions and download buttons for web-res and print-res. Use when the user says: 'preview gallery', 'show gallery page', 'how will the client see this', 'gallery preview'.

Parameters:
- `galleryId` (string): ID of the gallery to preview

### enso_client_gallery_record_download

Log a download event for a photo in a gallery, tracking resolution type, client name, and timestamp. Use when the user says: 'record a download', 'log this download', 'track download', 'client downloaded a photo'.

Parameters:
- `galleryId` (string): ID of the gallery
- `photoId` (string): ID of the downloaded photo
- `resolution` (string): Resolution type: 'web' or 'print'
- `clientName` (string): Name of the client who downloaded

### enso_client_gallery_get_download_stats

Show download analytics for a gallery: which photos downloaded most, by whom, web vs print breakdown, total downloads. Use when the user says: 'show download stats', 'gallery analytics', 'who downloaded my photos', 'download report'.

Parameters:
- `galleryId` (string): ID of the gallery to get stats for
