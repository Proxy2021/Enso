---
name: remote_desktop
description: "Remote desktop viewer with click, type, scroll, and keyboard control"
---

# Remote Desktop

Remote desktop viewer with click, type, scroll, and keyboard control

## Available Tools

### enso_remote_desktop_capture (primary)

Capture a screenshot of the remote desktop

Parameters:
- `monitor` (number): Monitor index (default 0 = primary)

### enso_remote_desktop_click

Click at screen coordinates then capture a new screenshot

Parameters:
- `x` (number): Screen X coordinate
- `y` (number): Screen Y coordinate
- `button` (string): left, right, or double (default: left)

### enso_remote_desktop_type

Type text on the remote desktop then capture a new screenshot

Parameters:
- `text` (string): Text to type

### enso_remote_desktop_scroll

Scroll at screen coordinates then capture a new screenshot

Parameters:
- `x` (number): Screen X coordinate
- `y` (number): Screen Y coordinate
- `direction` (string): up, down, left, or right
- `amount` (number): Scroll amount (default 3)

### enso_remote_desktop_key

Send a key combination then capture a new screenshot

Parameters:
- `combo` (string): Key combo like control+c, alt+tab, enter, escape
