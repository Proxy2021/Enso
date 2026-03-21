---
name: asset_gallery
description: "Digital asset management gallery for browsing, organizing, searching, and managing visual assets with status workflows, tagging, and campaign organization"
---

# Asset Gallery

Digital asset management gallery for browsing, organizing, searching, and managing visual assets with status workflows, tagging, and campaign organization

## Available Tools

### enso_asset_gallery_browse (primary)

Browse assets in a collection or campaign with filtering and sorting. Shows grid of assets with metadata.

Parameters:
- `path` (string): Collection or folder path to browse
- `campaign` (string): Filter by campaign name
- `status` (string): Filter by status: Approved, Draft, In-Use, Archived
- `format` (string): Filter by format: JPEG, PNG, MP4, GIF
- `sortBy` (string): Sort field: dateAdded, title, campaign, format (default: dateAdded)
- `sortDir` (string): Sort direction: asc or desc (default: desc)

### enso_asset_gallery_view

View a single asset with full metadata including tags, dimensions, usage rights, campaign, and notes

Parameters:
- `id` (string): Asset ID to view

### enso_asset_gallery_search

Search assets by keywords matching title, tags, campaign, and notes

Parameters:
- `query` (string): Search query
- `path` (string): Collection path to search within

### enso_asset_gallery_status

Update the workflow status of one or more assets (Approved, Draft, In-Use, Archived, Rejected)

Parameters:
- `id` (string): Single asset ID
- `ids` (array): Multiple asset IDs for bulk status update
- `status` (string): New status: Approved, Draft, In-Use, Archived, Rejected

### enso_asset_gallery_organize

Organize assets: move to campaign, add/remove tags, create collections, bulk operations

Parameters:
- `action` (string): Action: move, tag, create_collection, delete
- `ids` (array): Asset IDs to operate on
- `campaign` (string): Target campaign for move action
- `tags` (array): Tags to add/remove
- `collectionName` (string): Collection name for create_collection action

### enso_asset_gallery_create

Register a new asset in the gallery with metadata

Parameters:
- `title` (string): Asset title
- `campaign` (string): Campaign name
- `format` (string): File format: JPEG, PNG, MP4, GIF
- `width` (number): Width in pixels
- `height` (number): Height in pixels
- `tags` (array): Asset tags
- `category` (string): Asset category: Hero Image, Social Post, Banner, Video, etc.
- `usageRights` (string): Usage rights: Royalty-Free, Rights-Managed, Internal Only, Unlimited
- `notes` (string): Notes about the asset
