---
name: photo_gallery
description: "Beautiful photo gallery for browsing, presenting, and comparing photos in artistic styles with multiple layout modes"
---

Read CLAUDE-REFERENCE.md first, then study openclaw-plugin/apps/media_gallery/ as the gold standard.

Build a reusable, general-purpose Photo Studio app with at least 4 tools, following the architecture from 'design-photo-studio-system'. This app handles the artistic photo processing side.

**Required tools (minimum 4):**
1. **import_photos** — Import photos by URL or from device. Accept single or multiple photo URLs. Store photo metadata (original URL, dimensions, import date).
2. **apply_style** — Apply an artistic style to a photo. Parameters: photo reference, style name (watercolor, oil_painting, sketch, pop_art, vintage, noir, impressionist, anime, etc.), intensity (0-100), optional color palette. Use an image processing API or CSS/canvas-based filters for style application.
3. **batch_process** — Apply a style to multiple photos at once. Parameters: photo collection reference, style name, intensity. Show progress and results.
4. **manage_collection** — Create, rename, delete, and list photo collections. Organize original and styled photos into named collections.
5. **compare_versions** — Show original vs. styled versions side by side for a given photo.

**Template requirements:**
- Clean, visual interface appropriate for a photo editing tool
- Show photo thumbnails with style previews
- Progress indicators for processing
- Before/after comparison view

All tools must be parameterized — no hardcoded values. App family: 'photo_studio'.

## Tool Reference

### enso_photo_gallery_browse_gallery (primary)

Browse photos in a visually rich gallery with grid, masonry, or list views. Supports filtering by style, sorting, and collection browsing.

Parameters:
- `collection` (string): Collection or folder name to browse (optional, shows all if omitted)
- `viewMode` (string): View mode: grid, masonry, or list (default: grid)
- `sortBy` (string): Sort field: date, name, or style (default: date)
- `filterStyle` (string): Filter photos by artistic style (e.g. watercolor, oil painting, minimal)

### enso_photo_gallery_view_slideshow

Present photos as an immersive full-screen slideshow with transitions, auto-advance, and captions

Parameters:
- `collection` (string): Collection name to display as slideshow
- `transition` (string): Transition effect: fade, slide, or zoom (default: fade)
- `interval` (number): Auto-advance interval in milliseconds (default: 4000)
- `captions` (boolean): Show photo captions (default: true)

### enso_photo_gallery_create_exhibition

Curate a themed exhibition from selected photos with museum, magazine, or minimal layout styles

Parameters:
- `title` (string): Exhibition title
- `description` (string): Exhibition description or curatorial statement
- `collection` (string): Source collection to curate from
- `photoIds` (string): Comma-separated photo IDs to include (optional, curates automatically if omitted)
- `layout` (string): Layout style: museum, magazine, or minimal (default: museum)

### enso_photo_gallery_compare_styles

Show a photo rendered in multiple artistic styles side by side for comparison

Parameters:
- `photoId` (string): ID of the original photo to compare
- `photoUrl` (string): URL of the original photo
- `collection` (string): Collection to find the photo in
- `styles` (string): Comma-separated list of styles to compare (e.g. 'watercolor,oil painting,minimal')

### enso_photo_gallery_filter_collection

Search and filter photos by style, date range, tags, or natural language query. Returns matching photos with thumbnails.

Parameters:
- `collection` (string): Collection to search within (optional, searches all if omitted)
- `query` (string): Natural language search query (e.g. 'sunset landscapes', 'warm colors')
- `filterStyle` (string): Filter by artistic style name
- `tags` (string): Comma-separated tags to filter by
- `dateFrom` (string): Filter photos from this date (ISO format)
- `dateTo` (string): Filter photos up to this date (ISO format)
- `limit` (number): Maximum results to return (default: 30)
