/**
 * tunnel-registry.ts — Cloudflare tunnel provisioning API.
 *
 * Runs on a "master" Enso instance (one that has CLOUDFLARE_API_TOKEN set).
 * Other Enso installations call these endpoints during setup to register
 * their <specifier>.enso.net subdomain.
 *
 * Endpoints:
 *   GET  /api/tunnel/check?specifier=xxx   — check availability
 *   POST /api/tunnel/register              — create tunnel + DNS
 *   DELETE /api/tunnel/:specifier          — remove tunnel (auth required)
 *   GET  /api/tunnel/list                  — list all tunnels (auth required)
 */

import { Router, type Request, type Response } from "express";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { ENSO_HOME } from "./utils/home.js";
import { logAction, logError } from "./action-log.js";

const DOMAIN = "enso.net";
const REGISTRY_FILE = join(ENSO_HOME, "tunnel-registry.json");

// ── Cloudflare config (from env) ──

const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const CF_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || "";
const CF_API = "https://api.cloudflare.com/client/v4";

// ── Types ──

interface TunnelEntry {
  tunnelId: string;
  publicUrl: string;
  accessTokenHash: string;
  createdAt: string;
}

interface TunnelRegistry {
  tunnels: Record<string, TunnelEntry>;
}

// ── Registry persistence ──

function readRegistry(): TunnelRegistry {
  try {
    if (existsSync(REGISTRY_FILE)) {
      return JSON.parse(readFileSync(REGISTRY_FILE, "utf-8"));
    }
  } catch {}
  return { tunnels: {} };
}

function writeRegistry(reg: TunnelRegistry): void {
  const dir = join(REGISTRY_FILE, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2) + "\n");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

// ── Cloudflare API helpers ──

async function cfFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${CF_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(opts.headers as Record<string, string> || {}),
    },
  });
  const body = await res.json();
  if (!body.success) {
    const errors = body.errors?.map((e: any) => e.message).join(", ") || "Unknown error";
    throw new Error(`Cloudflare API error: ${errors}`);
  }
  return body.result;
}

async function createTunnel(name: string): Promise<{ tunnelId: string }> {
  const result = await cfFetch(`/accounts/${CF_ACCOUNT_ID}/cfd_tunnel`, {
    method: "POST",
    body: JSON.stringify({
      name: `enso-${name}`,
      tunnel_secret: Buffer.from(createHash("sha256").update(name + Date.now()).digest()).toString("base64"),
    }),
  });
  return { tunnelId: result.id };
}

async function getTunnelToken(tunnelId: string): Promise<string> {
  const result = await cfFetch(`/accounts/${CF_ACCOUNT_ID}/cfd_tunnel/${tunnelId}/token`);
  // The result is the token string directly
  return typeof result === "string" ? result : result.token || result;
}

async function createDnsRecord(specifier: string, tunnelId: string): Promise<void> {
  await cfFetch(`/zones/${CF_ZONE_ID}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      type: "CNAME",
      name: `${specifier}.${DOMAIN}`,
      content: `${tunnelId}.cfargotunnel.com`,
      proxied: true,
      comment: `Enso tunnel for ${specifier}`,
    }),
  });
}

async function deleteTunnel(tunnelId: string): Promise<void> {
  // Clean up connections first
  await cfFetch(`/accounts/${CF_ACCOUNT_ID}/cfd_tunnel/${tunnelId}/connections`, {
    method: "DELETE",
  }).catch(() => {});
  // Delete tunnel
  await cfFetch(`/accounts/${CF_ACCOUNT_ID}/cfd_tunnel/${tunnelId}`, {
    method: "DELETE",
  });
}

async function deleteDnsRecord(specifier: string): Promise<void> {
  // Find the DNS record
  const records = await cfFetch(
    `/zones/${CF_ZONE_ID}/dns_records?name=${specifier}.${DOMAIN}&type=CNAME`
  );
  for (const record of records || []) {
    await cfFetch(`/zones/${CF_ZONE_ID}/dns_records/${record.id}`, {
      method: "DELETE",
    });
  }
}

// ── Validation ──

const SPECIFIER_REGEX = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

function validateSpecifier(specifier: string): string | null {
  if (!specifier) return "Specifier is required";
  if (specifier.length < 3) return "Specifier must be at least 3 characters";
  if (specifier.length > 30) return "Specifier must be at most 30 characters";
  if (!SPECIFIER_REGEX.test(specifier)) {
    return "Specifier must be lowercase alphanumeric with hyphens, 3-30 chars, starting and ending with alphanumeric";
  }
  return null;
}

// ── Router ──

export const tunnelRoutes = Router();

// Check availability
tunnelRoutes.get("/check", (req: Request, res: Response) => {
  const specifier = (String(req.query.specifier || "")).toLowerCase();
  const error = validateSpecifier(specifier);
  if (error) {
    res.json({ available: false, error });
    return;
  }

  const registry = readRegistry();
  const available = !registry.tunnels[specifier];
  res.json({ available });
});

// Register a new tunnel
tunnelRoutes.post("/register", async (req: Request, res: Response) => {
  try {
    const { specifier: rawSpecifier, accessToken } = req.body || {};
    const specifier = (rawSpecifier || "").toLowerCase();

    const error = validateSpecifier(specifier);
    if (error) {
      res.status(400).json({ error });
      return;
    }

    if (!accessToken) {
      res.status(400).json({ error: "accessToken is required" });
      return;
    }

    if (!CF_API_TOKEN || !CF_ACCOUNT_ID || !CF_ZONE_ID) {
      res.status(503).json({ error: "Tunnel registry not configured (missing Cloudflare credentials)" });
      return;
    }

    const registry = readRegistry();
    if (registry.tunnels[specifier]) {
      res.status(409).json({ error: `'${specifier}' is already taken` });
      return;
    }

    // Create Cloudflare tunnel
    const { tunnelId } = await createTunnel(specifier);

    // Create DNS CNAME record
    await createDnsRecord(specifier, tunnelId);

    // Get tunnel token for the client
    const tunnelToken = await getTunnelToken(tunnelId);

    const publicUrl = `https://${specifier}.${DOMAIN}`;

    // Save to registry
    registry.tunnels[specifier] = {
      tunnelId,
      publicUrl,
      accessTokenHash: hashToken(accessToken),
      createdAt: new Date().toISOString(),
    };
    writeRegistry(registry);

    logAction({
      ts: Date.now(),
      type: "action",
      category: "tunnel",
      message: `Registered tunnel: ${specifier}.${DOMAIN}`,
    });

    res.json({ tunnelToken, tunnelId, publicUrl });
  } catch (err: any) {
    logError("tunnel", "Registration failed", err);
    res.status(500).json({ error: err.message || "Tunnel registration failed" });
  }
});

// Delete a tunnel (requires matching access token)
tunnelRoutes.delete("/:specifier", async (req: Request, res: Response) => {
  try {
    const specifier = String(req.params.specifier).toLowerCase();
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    const registry = readRegistry();
    const entry = registry.tunnels[specifier];
    if (!entry) {
      res.status(404).json({ error: "Tunnel not found" });
      return;
    }

    // Verify ownership
    if (hashToken(token) !== entry.accessTokenHash) {
      res.status(403).json({ error: "Unauthorized" });
      return;
    }

    // Delete from Cloudflare
    await deleteDnsRecord(specifier);
    await deleteTunnel(entry.tunnelId);

    // Remove from registry
    delete registry.tunnels[specifier];
    writeRegistry(registry);

    logAction({
      ts: Date.now(),
      type: "action",
      category: "tunnel",
      message: `Deleted tunnel: ${specifier}.${DOMAIN}`,
    });

    res.json({ ok: true });
  } catch (err: any) {
    logError("tunnel", "Deletion failed", err);
    res.status(500).json({ error: err.message || "Tunnel deletion failed" });
  }
});

// List all tunnels (admin — no auth for now, can add later)
tunnelRoutes.get("/list", (_req: Request, res: Response) => {
  const registry = readRegistry();
  const tunnels = Object.entries(registry.tunnels).map(([specifier, entry]) => ({
    specifier,
    tunnelId: entry.tunnelId,
    publicUrl: entry.publicUrl,
    createdAt: entry.createdAt,
  }));
  res.json({ tunnels });
});
