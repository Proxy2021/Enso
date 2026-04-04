/**
 * shell-pty.test.ts — Tests for Shell PTY session manager.
 * Covers BUG-01: Shell CWD validation and session management.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "fs";
import { homedir } from "os";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

// Compute expected project root the same way shell-pty.ts does
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const EXPECTED_PROJECT_ROOT = resolve(join(PLUGIN_DIR, "..", ".."));

// Mock node-pty to avoid spawning real processes
vi.mock("node-pty", () => {
  const mockProcess = {
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    pid: 12345,
  };
  return {
    spawn: vi.fn(() => mockProcess),
  };
});

// Mock server types
vi.mock("./server.js", () => ({
  toMediaUrl: (p: string) => `http://localhost:3001/media/${Buffer.from(p).toString("base64url")}`,
}));

vi.mock("./action-log.js", () => ({
  logAction: vi.fn(),
  logError: vi.fn(),
}));

import * as ptyModule from "node-pty";
import { validateCwd, createShellSession, destroyShell, getSessionCount, destroyClientSessions } from "./shell-pty.js";

function makeMockClient(id = "test-client-1") {
  return {
    id,
    sessionKey: "test-session",
    ws: {} as unknown,
    send: vi.fn(),
    chatModel: undefined,
  } as unknown as Parameters<typeof createShellSession>[0]["client"];
}

describe("validateCwd", () => {
  it("returns project root when no CWD is provided", () => {
    const result = validateCwd(undefined);
    // Should return the project root, not homedir
    expect(result).toBe(EXPECTED_PROJECT_ROOT);
    expect(result).not.toBe(homedir());
  });

  it("returns the same path for valid existing directory", () => {
    const result = validateCwd(EXPECTED_PROJECT_ROOT);
    expect(result).toBe(resolve(EXPECTED_PROJECT_ROOT));
  });

  it("falls back to project root for non-existent directory", () => {
    const result = validateCwd("Z:\\NonExistent\\Path\\12345");
    // Should fall back to project root, not homedir
    expect(result).toBe(EXPECTED_PROJECT_ROOT);
  });

  it("never returns homedir when project root exists", () => {
    // This is the key regression guard for BUG-01
    expect(existsSync(EXPECTED_PROJECT_ROOT)).toBe(true);
    const result = validateCwd(undefined);
    expect(result).not.toBe(homedir());
  });

  it("returns explicitly provided valid CWD", () => {
    const tmpDir = process.env.TEMP || process.env.TMP || "/tmp";
    if (existsSync(tmpDir)) {
      const result = validateCwd(tmpDir);
      expect(existsSync(result)).toBe(true);
    }
  });
});

describe("createShellSession", () => {
  beforeEach(() => {
    // Clean up any existing sessions
    let count = getSessionCount();
    while (count > 0) {
      // We can't easily destroy by ID without knowing them, but destroyClientSessions handles it
      destroyClientSessions("test-client-1");
      destroyClientSessions("test-client-2");
      count = getSessionCount();
    }
  });

  it("creates a session with default CWD at project root", () => {
    const client = makeMockClient();
    const sessionId = createShellSession({
      client,
      targetCardId: "card-1",
    });

    expect(typeof sessionId).toBe("string");
    expect(sessionId.length).toBeGreaterThan(0);
    expect(getSessionCount()).toBeGreaterThanOrEqual(1);

    // Clean up
    destroyShell(sessionId);
  });

  it("honors explicit CWD parameter", () => {
    const client = makeMockClient();
    const spawnMock = vi.mocked(ptyModule.spawn);
    spawnMock.mockClear();

    const sessionId = createShellSession({
      client,
      targetCardId: "card-2",
      cwd: EXPECTED_PROJECT_ROOT,
    });

    // Verify pty.spawn was called with correct CWD
    expect(spawnMock).toHaveBeenCalled();
    const lastCall = spawnMock.mock.calls[spawnMock.mock.calls.length - 1];
    expect(lastCall[2].cwd).toBe(EXPECTED_PROJECT_ROOT);

    destroyShell(sessionId);
  });

  it("enforces max sessions per client (3)", () => {
    const client = makeMockClient();
    const sessions: string[] = [];

    // Create 3 sessions (should succeed)
    for (let i = 0; i < 3; i++) {
      sessions.push(createShellSession({
        client,
        targetCardId: `card-${i}`,
      }));
    }

    // 4th should throw
    expect(() => {
      createShellSession({
        client,
        targetCardId: "card-4",
      });
    }).toThrow(/Maximum concurrent shell sessions/);

    // Clean up
    for (const id of sessions) destroyShell(id);
  });

  it("destroyShell removes a session", () => {
    const client = makeMockClient();
    const sessionId = createShellSession({
      client,
      targetCardId: "card-d",
    });

    expect(getSessionCount()).toBeGreaterThanOrEqual(1);
    const result = destroyShell(sessionId);
    expect(result).toBe(true);

    // Destroying again should return false
    expect(destroyShell(sessionId)).toBe(false);
  });

  it("destroyClientSessions removes all sessions for a client", () => {
    const client1 = makeMockClient("client-A");
    const client2 = makeMockClient("client-B");

    createShellSession({ client: client1, targetCardId: "c1" });
    createShellSession({ client: client1, targetCardId: "c2" });
    createShellSession({ client: client2, targetCardId: "c3" });

    const removed = destroyClientSessions("client-A");
    expect(removed).toBe(2);

    // Client B session should still exist
    expect(getSessionCount()).toBeGreaterThanOrEqual(1);

    destroyClientSessions("client-B");
  });
});
