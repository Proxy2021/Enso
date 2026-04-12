#!/usr/bin/env bash
# install-watchdog.sh — Install Enso watchdog as a macOS LaunchAgent (2-minute interval)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WATCHDOG="$SCRIPT_DIR/watchdog.sh"
PLIST_DIR="$HOME/Library/LaunchAgents"
LABEL="ai.enso.watchdog"
PLIST="$PLIST_DIR/${LABEL}.plist"
UID_NUM="$(id -u)"

chmod +x "$WATCHDOG"

# Remove old labels
for OLD_LABEL in "$LABEL" "ai.enso.enso-watchdog"; do
  launchctl bootout "gui/$UID_NUM/$OLD_LABEL" 2>/dev/null || true
  OLD_PLIST="$PLIST_DIR/${OLD_LABEL}.plist"
  [ -f "$OLD_PLIST" ] && rm -f "$OLD_PLIST"
done

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
    <integer>120</integer>
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
echo "[watchdog] Installed and started: $LABEL (every 2 minutes)"
echo "[watchdog] Plist: $PLIST"
echo "[watchdog] Log:   ~/.enso/watchdog.log"
