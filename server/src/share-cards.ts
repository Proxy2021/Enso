/**
 * Share Cards — public, notification-bound interactive landing pages.
 *
 * A scheduled task delivers a notification with an attached card snapshot
 * (template JSX + executor data). The recipient opens /share/<notificationId>
 * which renders the same JSX template the in-app card uses, with onAction
 * routed through HTTP instead of the WS card.action path.
 *
 * Auth = possession of the unguessable notificationId. Actions are restricted
 * to a per-snapshot allowlist declared by the scheduled task.
 *
 * State persists: every action calls the same executor as the in-app version,
 * which writes to the same shared stores (~/.enso/data/...). The only
 * difference is which transport delivered the click.
 */

import { executeToolDirect } from "./native-tools/registry.js";
import {
  getNotificationContext,
  attachCardSnapshot,
  updateSnapshotData,
  type SharedCardSnapshot,
  type NotificationContext,
} from "./reacts.js";
import { loadAllApps } from "./app-persistence.js";
import { logAction, logError } from "./action-log.js";

// ── Snapshot construction ──

/**
 * Build a fresh card snapshot for an app: looks up the loaded app, runs
 * its primary tool with the given params, and packages template + data.
 *
 * Used by scheduled tasks (and any caller that wants to attach an interactive
 * card to a notification it's about to send).
 */
export async function buildCardSnapshot(opts: {
  appId: string;
  primaryParams?: Record<string, unknown>;
  allowedActions: string[];
  refreshable?: boolean;
  title: string;
  ttlDays?: number;
}): Promise<{ ok: true; snapshot: SharedCardSnapshot } | { ok: false; error: string }> {
  const apps = loadAllApps();
  const app = apps.find((a) => a.spec.toolFamily === opts.appId);
  if (!app) return { ok: false, error: `App "${opts.appId}" not found` };

  const primaryDef = app.spec.tools.find((t) => t.isPrimary) ?? app.spec.tools[0];
  if (!primaryDef) return { ok: false, error: `App "${opts.appId}" has no tools` };

  const primaryToolName = `${app.spec.toolPrefix}${primaryDef.suffix}`;
  const result = await executeToolDirect(primaryToolName, opts.primaryParams ?? {});
  if (!result.success) {
    return { ok: false, error: `Primary tool "${primaryToolName}" failed: ${result.error ?? "unknown"}` };
  }

  return {
    ok: true,
    snapshot: {
      appId: opts.appId,
      toolPrefix: app.spec.toolPrefix,
      primaryToolName,
      templateJSX: app.templateJSX,
      data: result.data,
      allowedActions: opts.allowedActions,
      refreshable: opts.refreshable ?? false,
      title: opts.title,
      ttlDays: opts.ttlDays,
    },
  };
}

/**
 * Convenience: build a snapshot AND attach it to an existing notification.
 * Returns the snapshot on success.
 */
export async function attachInteractiveCard(opts: {
  notificationId: string;
  appId: string;
  primaryParams?: Record<string, unknown>;
  allowedActions: string[];
  refreshable?: boolean;
  title: string;
  ttlDays?: number;
}): Promise<{ ok: true; snapshot: SharedCardSnapshot } | { ok: false; error: string }> {
  const built = await buildCardSnapshot(opts);
  if (!built.ok) return built;
  attachCardSnapshot(opts.notificationId, built.snapshot);
  logAction({
    ts: Date.now(),
    type: "action",
    category: "share",
    message: `Attached interactive card "${opts.appId}" to notification ${opts.notificationId} (allowed: ${opts.allowedActions.join(",")})`,
  });
  return built;
}

// ── Endpoint handlers ──

export interface ShareGetResponse {
  notificationId: string;
  title: string;
  templateJSX: string;
  data: unknown;
  allowedActions: string[];
  refreshable: boolean;
  sentAt: string;
  expiresAt: string;
  appId: string;
  notificationType: NotificationContext["type"];
}

/**
 * GET /api/share/:notificationId — return everything the public landing page
 * needs to render. Errors map to HTTP 404 (missing) / 410 (expired) / 409
 * (notification exists but no card attached).
 */
export function getSharePayload(notificationId: string):
  | { ok: true; payload: ShareGetResponse }
  | { ok: false; status: 404 | 409 | 410; error: string }
{
  const ctx = getNotificationContext(notificationId);
  if (!ctx) return { ok: false, status: 404, error: "Notification not found" };
  if (!ctx.card) return { ok: false, status: 409, error: "This notification has no interactive card attached" };

  const ttlDays = ctx.card.ttlDays ?? 7;
  const sentMs = new Date(ctx.sentAt).getTime();
  const expiresMs = sentMs + ttlDays * 24 * 60 * 60 * 1000;
  if (Date.now() > expiresMs) {
    return { ok: false, status: 410, error: "This shared card has expired" };
  }

  return {
    ok: true,
    payload: {
      notificationId,
      title: ctx.card.title,
      templateJSX: ctx.card.templateJSX,
      data: ctx.card.data,
      allowedActions: ctx.card.allowedActions.slice(),
      refreshable: ctx.card.refreshable,
      sentAt: ctx.sentAt,
      expiresAt: new Date(expiresMs).toISOString(),
      appId: ctx.card.appId,
      notificationType: ctx.type,
    },
  };
}

/**
 * POST /api/share/:notificationId/action — invoke an executor on behalf
 * of the recipient. Whitelisted actions only. Persists the result back
 * into the snapshot so subsequent loads (or refreshes) see the latest state.
 */
export async function invokeShareAction(
  notificationId: string,
  action: string,
  payload: unknown,
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; status: 403 | 404 | 410 | 500; error: string }
> {
  const ctx = getNotificationContext(notificationId);
  if (!ctx) return { ok: false, status: 404, error: "Notification not found" };
  if (!ctx.card) return { ok: false, status: 404, error: "No interactive card attached" };

  const ttlDays = ctx.card.ttlDays ?? 7;
  const sentMs = new Date(ctx.sentAt).getTime();
  if (Date.now() > sentMs + ttlDays * 24 * 60 * 60 * 1000) {
    return { ok: false, status: 410, error: "This shared card has expired" };
  }

  // The primary tool's action name is always permitted — templates need it to
  // navigate back to the default view from sub-views (e.g. factor_info → today).
  // It's the same read that built the snapshot in the first place.
  const primaryAction = ctx.card.primaryToolName.slice(ctx.card.toolPrefix.length);
  const isPrimaryReload = action === primaryAction;

  if (!isPrimaryReload && !ctx.card.allowedActions.includes(action)) {
    return { ok: false, status: 403, error: `Action "${action}" is not allowed on this shared card` };
  }

  const toolName = `${ctx.card.toolPrefix}${action}`;
  const params = (payload && typeof payload === "object") ? (payload as Record<string, unknown>) : {};

  try {
    const result = await executeToolDirect(toolName, params);
    if (!result.success) {
      logError("share", `Action "${action}" failed for ${notificationId}: ${result.error ?? "unknown"}`);
      return { ok: false, status: 500, error: result.error ?? "Tool execution failed" };
    }

    updateSnapshotData(notificationId, result.data);

    logAction({
      ts: Date.now(),
      type: "action",
      category: "share",
      message: `Share action ${notificationId}/${action} → ${toolName}`,
    });

    return { ok: true, data: result.data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError("share", `Share action threw for ${notificationId}/${action}`, err);
    return { ok: false, status: 500, error: msg };
  }
}

/**
 * POST /api/share/:notificationId/refresh — re-run the primary tool with
 * empty params (its default). Updates the snapshot and returns fresh data.
 * Disabled unless the snapshot was created with refreshable: true.
 */
export async function invokeShareRefresh(notificationId: string): Promise<
  | { ok: true; data: unknown }
  | { ok: false; status: 403 | 404 | 410 | 500; error: string }
> {
  const ctx = getNotificationContext(notificationId);
  if (!ctx) return { ok: false, status: 404, error: "Notification not found" };
  if (!ctx.card) return { ok: false, status: 404, error: "No interactive card attached" };

  const ttlDays = ctx.card.ttlDays ?? 7;
  const sentMs = new Date(ctx.sentAt).getTime();
  if (Date.now() > sentMs + ttlDays * 24 * 60 * 60 * 1000) {
    return { ok: false, status: 410, error: "This shared card has expired" };
  }

  if (!ctx.card.refreshable) {
    return { ok: false, status: 403, error: "Refresh is disabled for this shared card" };
  }

  try {
    const result = await executeToolDirect(ctx.card.primaryToolName, {});
    if (!result.success) {
      return { ok: false, status: 500, error: result.error ?? "Refresh failed" };
    }

    updateSnapshotData(notificationId, result.data);

    logAction({
      ts: Date.now(),
      type: "action",
      category: "share",
      message: `Share refresh ${notificationId} → ${ctx.card.primaryToolName}`,
    });

    return { ok: true, data: result.data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError("share", `Share refresh threw for ${notificationId}`, err);
    return { ok: false, status: 500, error: msg };
  }
}
