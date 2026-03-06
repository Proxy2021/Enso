Deploy Enso (merge, build, commit, push, restart) then build and publish a new Android APK release for OTA client updates.

> **⛔ If you are running inside the Enso gateway** — do NOT run this command. It restarts the gateway and would kill your session.

## How the Mobile Update Pipeline Works

1. `package.json` holds `version` (semver) and `versionCode` (integer) — single source of truth
2. `android/app/build.gradle` reads both from package.json at build time
3. Server exposes `/api/version` (version info + apkAvailable) and `/api/apk` (download)
4. Mobile client checks `/api/version` every 30 minutes via `version-check.ts`
5. If `serverVersionCode > installedVersionCode`, an UpdateBanner appears
6. User taps Update → `AppUpdaterPlugin.installApk()` downloads APK → triggers system installer

## Steps

### Phase 1 — Deploy (same as /enso-deploy)

1. **Merge worktree to main**: If on a worktree branch, merge into `main`. If already on main, skip.

2. **Build web frontend**: Run `npm run build` to produce the production bundle.

3. **Assess & update docs**: Review recent commits. Only update docs for major features (see /enso-deploy for criteria). Skip for minor changes.

4. **Commit** any uncommitted changes (doc updates, build artifacts).

5. **Push**: `git push` to remote.

### Phase 2 — Version Bump

6. **Bump version in `package.json`**:
   - Increment `versionCode` by 1 (e.g. 57 → 58)
   - Bump the patch component of `version` (e.g. "0.2.55" → "0.2.56")
   - Use a targeted edit — only change the version lines, don't touch anything else

7. **Commit version bump**: `chore: bump version to <version> (versionCode <code>)`

### Phase 3 — Build Android APK

8. **Set up environment** (needed for Gradle):
   ```
   export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
   export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
   ```
   Verify Java is available: `$JAVA_HOME/bin/java -version`
   If not found, install: `brew install openjdk@21`

9. **Sync web assets to Android**: `npx cap sync android`
   This copies `dist/` into `android/app/src/main/assets/public/`.

10. **Build release APK**: From the `android/` directory:
    ```
    ./gradlew assembleRelease
    ```
    Expected output: `android/app/build/outputs/apk/release/app-release.apk`
    Uses the `enso-release.keystore` signing config from `build.gradle`.

11. **Verify APK**: Confirm the file exists and check size (`ls -lh`). Typical size: 3-5 MB.

### Phase 4 — Publish & Restart

12. **Push version bump**: `git push`

13. **Restart services**: Run the restart script for the current platform:
    - **macOS**: `./restart.sh` from the project root
    - **Windows**: `powershell -ExecutionPolicy Bypass -File restart.ps1`

14. **Verify release endpoint**: After services restart, confirm the APK is served:
    ```
    curl -s http://localhost:3001/api/version | python3 -m json.tool
    ```
    Should show the new `versionCode`, `apkAvailable: true`, and `apkSizeBytes > 0`.

### Summary

Report results in a table:

| Step | Detail |
|------|--------|
| Version | `<old>` → `<new>` (versionCode `<old>` → `<new>`) |
| Web build | ✅ / ❌ |
| APK build | ✅ `<size>` / ❌ `<error>` |
| Push | ✅ `<commit>` |
| Services | ✅ running / ❌ |
| `/api/version` | `apkAvailable: true`, `versionCode: <new>` |

Connected mobile clients will see the update banner within 30 minutes (or immediately on next app open).
