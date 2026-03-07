---
name: photo_gallery
description: "Beautiful photo gallery for browsing, presenting, and comparing photos in artistic styles with multiple layout modes"
---

# Photo Gallery

Beautiful photo gallery for browsing, presenting, and comparing photos in artistic styles with multiple layout modes

## Available Tools

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
