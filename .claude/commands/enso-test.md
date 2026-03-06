Comprehensive live end-to-end test of the Enso platform. Tests infrastructure, backend, and frontend features in the browser with strict pass/fail criteria.

> **Approach**: If any tests fail, list all failures with root causes and recommend specific fixes. The user can then enter plan mode to address issues before re-testing.

## Phase 1 — Infrastructure Health

Verify all services are running. If any fail here, stop and tell the user to run `./restart.sh` first.

1. **Plugin server**: `curl -sf http://localhost:3001/health` → must return `{"ok":true}`
2. **Vite dev server**: `curl -sf -o /dev/null -w '%{http_code}' http://localhost:5173` → must be `200`
3. **Version endpoint**: `curl -sf http://localhost:3001/api/version` → must return valid JSON with `versionCode` field
4. **Action log**: `curl -sf "http://localhost:3001/api/action-log?count=5"` → must return JSON array
5. **WebSocket**: Write a quick Node script to verify WS connection:
   ```bash
   node -e "
     const ws = new (require('ws'))('ws://localhost:3001/ws');
     ws.on('open', () => { console.log('WS_OK'); ws.close(); process.exit(0); });
     ws.on('error', (e) => { console.log('WS_FAIL:', e.message); process.exit(1); });
     setTimeout(() => { console.log('WS_TIMEOUT'); process.exit(1); }, 5000);
   "
   ```
   If `ws` module not available, skip this check with a note.

Record the current timestamp before proceeding — you'll use it in Phase 5 to filter new errors.

## Phase 2 — Backend Unit Tests

Run the Vitest test suite:
```bash
npx vitest run --reporter=verbose 2>&1
```

**Pass criteria**: All tests pass (exit code 0). Report X/Y passed. If any fail, log the failure details but continue testing.

## Phase 3 — TypeScript Compilation

Run both server and frontend type checks:
```bash
npx tsc -p tsconfig.server.json --noEmit 2>&1
npx tsc --noEmit 2>&1
```

**Pass criteria**: No compilation errors (exit code 0 for both).

## Phase 4 — Live Feature Tests (Browser)

Use the Chrome browser (Claude in Chrome MCP tools) to interact with the running Enso web app. For each test, take a screenshot to verify visual state.

### 4.1 — Page Load & Connection
- Navigate to `http://localhost:5173`
- Take a screenshot
- Verify: the chat UI renders (input bar visible at bottom, card timeline area visible)
- Verify: connection state is "connected" (no disconnection banner or error)
- Check browser console for errors (filter for errors only — ignore warnings)
- **Pass**: Page loads, UI renders, connected, no JS errors

### 4.2 — Chat Round-Trip
- Type a simple message: `Hello, what can you help me with?`
- Send it (click send or press Enter)
- Wait up to 15 seconds for a response
- Take a screenshot
- Verify: a response card appears below the user message
- Verify: the response contains readable text (not empty, not error)
- **Pass**: Response card appears with text content

### 4.3 — App Enhancement
- On the response card from 4.2, find and click the "App" or enhance button (the wand/sparkle icon or app dropdown)
- Wait up to 15 seconds for enhancement to complete
- Take a screenshot
- Verify: a DynamicUICard renders with interactive UI (buttons, tabs, or data display)
- Verify: no red error boundary or "Component Error" message
- **Pass**: Enhanced card shows interactive React UI without errors

### 4.4 — Mission Planner
> **Note**: This test requires Claude Code CLI to be available. If `/mission` isn't available or Claude Code can't run, skip with a note.

- Look for the Mission Planner tile on the WelcomeCard, or type `/mission` in the chat input
- In the Mission Planner input, type: `I want to track my fitness goals, meal plans, and workout routines`
- Submit the mission
- Take a screenshot of the analyzing phase
- Verify: analyzing text shows "researching solutions" (not old generic text)
- Wait for the proposal phase (up to 2 minutes — Claude Code analysis takes time)
- Once proposals appear, take a screenshot
- Verify the **competitive research** section:
  - A collapsible "Competitive Research" panel with purple styling is visible
  - Click to expand it — shows competitor names, strengths, and gaps
- Verify **inspiredBy** on proposals:
  - At least one proposed app shows a purple italic "💡" line explaining competitive edge
- Verify **interaction**:
  - Checkboxes toggle (click one to uncheck, click again to re-check)
  - App count updates ("X of Y apps selected")
- **Do NOT click "Build"** — this is a non-destructive test
- **Pass**: Research section visible, inspiredBy shown, checkboxes work

### 4.5 — Apps Menu
- Find and click the Apps menu button (grid/apps icon in the header or sidebar)
- Take a screenshot
- Verify: menu opens and lists apps (or shows empty state if none exist)
- Close the menu
- **Pass**: Apps menu opens and closes without errors

### 4.6 — Remote Terminal (Shell)
- Type `/shell` in the chat input and send
- Wait up to 10 seconds for terminal to appear
- Take a screenshot
- Verify: a terminal card renders with a dark terminal area (xterm.js)
- Type `echo "enso-test-ok"` and press Enter
- Wait 3 seconds, take a screenshot
- Verify: output shows `enso-test-ok`
- **Pass**: Terminal renders, command executes, output visible

## Phase 5 — Error Log Review

Check for errors generated during the test run:
```bash
curl -sf "http://localhost:3001/api/action-log?count=50&type=error"
```

Filter entries by timestamp (only those after the timestamp recorded in Phase 1).

**Pass criteria**: No new error entries were logged during the test session. If errors exist, report them with their category and message.

## Phase 6 — Report & Verdict

Present results in a summary table:

| Category | Test | Result | Details |
|----------|------|--------|---------|
| Infrastructure | Plugin server health | ✅/❌ | |
| Infrastructure | Vite dev server | ✅/❌ | |
| Infrastructure | Version endpoint | ✅/❌ | |
| Infrastructure | Action log API | ✅/❌ | |
| Infrastructure | WebSocket connection | ✅/❌ | |
| Backend | Vitest unit tests | ✅/❌ | X/Y passed |
| Backend | Server TypeScript | ✅/❌ | |
| Backend | Frontend TypeScript | ✅/❌ | |
| Frontend | Page load & connection | ✅/❌ | |
| Frontend | Chat round-trip | ✅/❌ | |
| Frontend | App enhancement | ✅/❌ | |
| Mission Planner | Analyzing phase text | ✅/❌ | |
| Mission Planner | Research summary | ✅/❌ | |
| Mission Planner | InspiredBy on proposals | ✅/❌ | |
| Mission Planner | Proposal interaction | ✅/❌ | |
| Apps | Apps menu | ✅/❌ | |
| Shell | Remote terminal | ✅/❌ | |
| Errors | No new errors in log | ✅/❌ | |

### Verdict

Count total passed vs total tests. Apply strict standard:

- **ALL PASS** → ✅ **All features verified.** Report success.
- **ANY FAIL** → ❌ **Features need improvement.** For each failure:
  1. State what failed and why
  2. Identify the root cause (missing UI element, server error, timeout, etc.)
  3. Suggest a specific fix
  4. Recommend entering plan mode to address the issues before re-testing

### Conventions

- **Non-destructive**: Never delete apps, build mission apps, modify settings, or make permanent changes
- **Timeouts**: 5-10s for simple operations, 15s for chat responses, up to 2 minutes for mission analysis
- **Screenshots**: Take screenshots at each visual verification step for evidence
- **Skip gracefully**: If a feature isn't available (e.g., no Claude Code for mission planner), mark as ⏭️ SKIPPED with explanation — don't count as failure
- **Browser console**: Check for errors after each frontend test step
