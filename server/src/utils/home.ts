/**
 * Home directory resolution — single source of truth.
 * Replaces 6+ copies of `process.env.HOME || process.env.USERPROFILE || ""`.
 */

import { join, resolve } from "node:path";
import { mkdirSync } from "node:fs";

export const HOME_DIR = process.env.HOME || process.env.USERPROFILE || "";

export const ENSO_HOME = process.env.ENSO_HOME || join(HOME_DIR, ".enso");

export function getEnsoPath(...segments: string[]): string {
  return join(ENSO_HOME, ...segments);
}

export function ensureEnsoDir(...segments: string[]): string {
  const dir = getEnsoPath(...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveHome(path: string): string {
  if (path.startsWith("~/")) {
    return resolve(HOME_DIR, path.slice(2));
  }
  return resolve(path);
}
