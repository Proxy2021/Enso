#!/usr/bin/env bash
# install-watchdog.sh — Install Enso watchdog as a macOS LaunchAgent (10-minute interval)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WATCHDOG="$SCRIPT_DIR/watchdog.sh"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST="$PLIST_DIR/ai.openclaw.enso-watchdog.plist"
LABEL="ai.openclaw.enso-watchdog"
UID_NUM="$(id -u)"

chmod +x "$WATCHDOG"

# Unload existing if present
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true

mkdir -p "$PLIST_DIR"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$WATCHDOG</string>
    </array>
    <key>StartInterval</key>
    <integer>600</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/enso-watchdog-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/enso-watchdog-stderr.log</string>
</dict>
</plist>
EOF

launchctl bootstrap "gui/$UID_NUM" "$PLIST"
echo "[watchdog] Installed and started: $LABEL (every 10 minutes)"
echo "[watchdog] Plist: $PLIST"
echo "[watchdog] Log:   ~/.openclaw/watchdog.log"
