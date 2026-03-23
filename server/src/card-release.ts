/**
 * card-release.ts — One-click commit, push & release after card evolution.
 *
 * Runs: git add → commit → push → version bump → npm build →
 *       [cap sync → APK build if Android tools available] → commit → push → restart.
 * Progress is streamed to the originating card as a system banner,
 * and final result is delivered via toast-compatible message.
 */

import { exec as execCb } from "child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { logAction, logError } from "./action-log.js";
import type { ConnectedClient } from "./server.js";
import type { ServerMessage } from "./types.js";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(PLUGIN_DIR, "..", "..");

function run(cmd: string, cwd = PROJECT_ROOT, timeoutMs = 120_000, env?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execCb(cmd, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs,
      env: env ? { ...process.env, ...env } : undefined,
    }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd}: ${stderr || err.message}`));
      else resolve(stdout.toString().trim());
    });
  });
}

/**
 * Detect whether Android build tools (Java, SDK, Gradle wrapper) are available.
 * Returns the env overrides needed for Gradle, or null if not buildable.
 */
function detectAndroidBuildCapability(): { androidHome: string; javaHome: string; gradlew: string } | null {
  const isWin = process.platform === "win32";
  const gradlew = join(PROJECT_ROOT, "android", isWin ? "gradlew.bat" : "gradlew");
  if (!existsSync(gradlew)) return null;

  const javaHome = process.env.JAVA_HOME;
  if (!javaHome || !existsSync(javaHome)) return null;

  // Common Android SDK locations
  const sdkCandidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    isWin ? join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk") : undefined,
    isWin ? "C:\\Android\\Sdk" : undefined,
    !isWin ? join(process.env.HOME ?? "", "Library", "Android", "sdk") : undefined,
    !isWin ? "/opt/homebrew/share/android-commandlinetools" : undefined,
  ];
  const androidHome = sdkCandidates.find((p) => p && existsSync(p));
  if (!androidHome) return null;

  return { androidHome, javaHome, gradlew };
}

export interface CardReleaseParams {
  cardId: string;
  family?: string;
  client: ConnectedClient;
  onRestartRequested?: () => void;
}

export async function handleCardRelease(params: CardReleaseParams): Promise<void> {
  const { cardId, family, client, onRestartRequested } = params;
  const runId = randomUUID();
  const steps: string[] = [];

  const send = (text: string, state: "streaming" | "final" = "streaming") => {
    client.send({
      id: randomUUID(),
      runId,
      sessionKey: client.sessionKey,
      seq: 0,
      timestamp: Date.now(),
      state,
      targetCardId: cardId,
      releaseProgress: text,
    } as ServerMessage);
  };

  const step = (label: string) => {
    steps.push(label);
    send(steps.join("\n"));
  };

  try {
    // 1. Check for changes
    step("Checking for changes...");
    await run("git add .");
    const status = await run("git status --porcelain");
    if (!status) {
      send("No uncommitted changes to release.", "final");
      return;
    }

    // 2. Commit
    const commitMsg = family
      ? `feat: evolved ${family} app — auto-sanitized template, improved structure`
      : "feat: card evolution improvements";
    step(`Committing: ${commitMsg.slice(0, 60)}...`);
    await run(`git commit -m "${commitMsg}"`);

    // 3. Push
    step("Pushing to remote...");
    await run("git push");

    // 4. Version bump
    step("Bumping version...");
    const pkgPath = join(PROJECT_ROOT, "package.json");
    const pkgRaw = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgRaw);
    const oldVersion = pkg.version;
    const oldCode = pkg.versionCode;
    const parts = oldVersion.split(".");
    parts[2] = String(parseInt(parts[2]) + 1);
    pkg.version = parts.join(".");
    pkg.versionCode = oldCode + 1;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
    step(`Version: ${oldVersion} → ${pkg.version} (${oldCode} → ${pkg.versionCode})`);

    // 5. Build web frontend
    step("Building web frontend...");
    await run("npm run build");

    // 6. APK build (if Android tools available)
    let apkBuilt = false;
    const android = detectAndroidBuildCapability();
    if (android) {
      const gradleEnv = { ANDROID_HOME: android.androidHome, JAVA_HOME: android.javaHome };

      step("Syncing web assets to Android...");
      await run("npx cap sync android");

      step("Building release APK...");
      const androidDir = join(PROJECT_ROOT, "android");
      const gradleCmd = process.platform === "win32"
        ? `"${android.gradlew}" assembleRelease`
        : `${android.gradlew} assembleRelease`;
      await run(gradleCmd, androidDir, 300_000, gradleEnv);

      const apkPath = join(androidDir, "app", "build", "outputs", "apk", "release", "app-release.apk");
      if (existsSync(apkPath)) {
        const sizeMB = (statSync(apkPath).size / (1024 * 1024)).toFixed(2);
        step(`APK built: ${sizeMB} MB`);
        apkBuilt = true;
      } else {
        step("APK build completed but file not found — skipped");
      }
    } else {
      step("Android build tools not available — APK skipped");
    }

    // 7. Commit version bump + build artifacts
    step("Committing version bump...");
    await run("git add .");
    await run(`git commit -m "chore: bump version to ${pkg.version} (versionCode ${pkg.versionCode})"`);

    // 8. Push version bump
    step("Pushing version bump...");
    await run("git push");

    // 9. Done — notify and restart
    const apkNote = apkBuilt ? " + APK" : "";
    step(`Released v${pkg.version}${apkNote} — restarting...`);
    send(steps.join("\n"), "final");

    logAction({
      ts: Date.now(),
      type: "action",
      category: "card-release",
      message: `Released v${pkg.version} (versionCode ${pkg.versionCode}) from card ${cardId.slice(0, 12)}`,
      cardId,
    });

    // Trigger restart after giving the WS message time to flush
    setTimeout(() => {
      if (onRestartRequested) {
        onRestartRequested();
      } else {
        process.exit(78);
      }
    }, 500);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logError("card-release", "Release failed", err, { cardId, family });
    steps.push(`FAILED: ${errMsg}`);
    send(steps.join("\n"), "final");
  }
}
