---
name: album_designer
description: "Gift photo album designer — plan Printique 10x10 lay-flat hardcover albums with 5-pass curation tracking, spread layout planning, narrative arc visualization, and print-ready checklists."
---

Gift photo album designer — plan Printique 10x10 lay-flat hardcover albums with 5-pass curation tracking, spread layout planning, narrative arc visualization, and print-ready checklists.

## Tool Reference

### enso_album_designer_setup_project (primary)

Create or load an album project with title, recipient, theme, and format specs. Use when the user says: 'start album project', 'create a photo book', 'design a gift album', 'plan my photo album'.

Parameters:
- `action` (string): Action: create, load, update, list, delete
- `projectId` (string): Project ID for load/update/delete (omit for create/list)
- `title` (string): Album title
- `recipient` (string): Who is this gift for?
- `theme` (string): Trip or theme name
- `targetSpreads` (number): Target number of spreads (default: 35)
- `targetImages` (number): Target total images (default: 60)

### enso_album_designer_update_curation

Track the 5-pass curation journey: update progress for each pass (Technical Kill, Print Test, Thematic Grouping, Narrative Arc, Album Cut) with remaining counts and completion status.

Parameters:
- `projectId` (string): Project ID
- `pass` (number): Pass number 1-5
- `remainingCount` (number): Number of images remaining after this pass
- `completed` (boolean): Mark this pass as completed
- `notes` (string): Optional notes for this pass

### enso_album_designer_manage_spreads

Plan album spread layouts — add, update, reorder, or remove spreads. Each spread has a layout type, image descriptions, theme tag, and narrative position.

Parameters:
- `projectId` (string): Project ID
- `action` (string): Action: add, update, remove, reorder, list
- `spreadIndex` (number): Spread index (0-based) for update/remove
- `layout` (string): Layout type: full_bleed, two_side_by_side, large_small, three_grid, text_page
- `imageDesc` (string): Description of images on this spread
- `themeTag` (string): Theme tag: light_shadow, faces, architecture, nature, culture, street, food, transport
- `narrativePos` (string): Narrative position: opening, rising, climax, resolution
- `moveFrom` (number): Source index for reorder
- `moveTo` (number): Destination index for reorder

### enso_album_designer_view_narrative

Visualize the album's narrative arc — see emotional pacing, theme distribution, and layout variety across all spreads. Flags pacing issues like consecutive similar themes.

Parameters:
- `projectId` (string): Project ID

### enso_album_designer_print_checklist

View and update the print-ready checklist — export settings, color profile, proof copy, spine text, cover image, budget estimate, and Printique order specs.

Parameters:
- `projectId` (string): Project ID
- `toggleItem` (string): Checklist item key to toggle: dpi_300, srgb_profile, proof_ordered, spine_text, cover_selected, images_exported, final_review
- `spineText` (string): Text for the album spine
- `coverImageDesc` (string): Description of the chosen cover image
- `notes` (string): Additional notes
