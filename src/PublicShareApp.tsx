/**
 * Public Share Page — single-card public-mode renderer for /share/<notificationId>.
 *
 * Renders the SAME JSX template that runs inside the chat, with onAction routed
 * through HTTP (POST /api/share/:id/action) instead of the authenticated WS
 * channel. Auth = possession of the unguessable notificationId.
 */
import React, { useEffect, useMemo, useState } from "react";
import { compileComponent } from "./lib/sandbox";
import { reportError } from "./lib/error-reporter";

interface SharePayload {
  notificationId: string;
  title: string;
  templateJSX: string;
  data: unknown;
  allowedActions: string[];
  refreshable: boolean;
  sentAt: string;
  expiresAt: string;
  appId: string;
  notificationType: string;
}

class PublicErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(`PublicShare render error: ${error.message}`, "card_render", {
      stack: error.stack, componentStack: info.componentStack ?? undefined,
    });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: "#7f1d1d", border: "1px solid #b91c1c", borderRadius: 10, padding: 16, color: "#fecaca", fontSize: 14 }}>
          <strong>Render error:</strong> {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

function ShareLayout(props: {
  title: string;
  meta?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100dvh", background: "#020617", color: "#e2e8f0", fontFamily: "-apple-system, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: "20px 16px 60px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16, padding: "8px 4px" }}>
          <div>
            <div style={{ color: "#a5b4fc", fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>Enso · Shared</div>
            <h1 style={{ margin: "4px 0 0", color: "#f8fafc", fontSize: 20, fontWeight: 700 }}>{props.title}</h1>
            {props.meta && <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>{props.meta}</div>}
          </div>
          {props.rightSlot}
        </header>
        {props.children}
      </div>
    </div>
  );
}

export default function PublicShareApp({ notificationId }: { notificationId: string }) {
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(notificationId)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) setLoadError({ status: res.status, message: body?.error ?? `HTTP ${res.status}` });
          return;
        }
        const json = (await res.json()) as SharePayload;
        if (!cancelled) setPayload(json);
      } catch (err) {
        if (!cancelled) setLoadError({ status: 0, message: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [notificationId]);

  const compiled = useMemo(
    () => (payload?.templateJSX ? compileComponent(payload.templateJSX) : null),
    [payload?.templateJSX],
  );

  const onAction = async (action: string, p?: unknown) => {
    if (!payload) return;
    setBusy(true);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(notificationId)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload: p }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionFeedback(`✗ ${body?.error ?? `Action failed (${res.status})`}`);
        return;
      }
      setPayload((prev) => (prev ? { ...prev, data: body.data } : prev));
    } catch (err) {
      setActionFeedback(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const onRefresh = async () => {
    if (!payload) return;
    setRefreshing(true);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(notificationId)}/refresh`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setActionFeedback(`✗ Refresh failed: ${body?.error ?? res.status}`); return; }
      setPayload((prev) => (prev ? { ...prev, data: body.data } : prev));
      setActionFeedback("✓ Refreshed");
    } catch (err) {
      setActionFeedback(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefreshing(false);
    }
  };

  // ── States ──
  if (loadError) {
    const expired = loadError.status === 410;
    return (
      <ShareLayout title={expired ? "Link expired" : "Unable to load"} meta={`Notification ${notificationId.slice(0, 8)}…`}>
        <div style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>{expired ? "⏳" : "⚠"}</div>
          <div style={{ color: "#fca5a5", fontSize: 14 }}>{loadError.message}</div>
          {expired && <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 8 }}>Shared cards expire after their TTL window. Open Enso for the latest version.</div>}
        </div>
      </ShareLayout>
    );
  }

  if (!payload) {
    return (
      <ShareLayout title="Loading…">
        <div style={{ animation: "pulse 1.5s ease-in-out infinite", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ height: 60, background: "rgba(148,163,184,0.1)", borderRadius: 10 }} />
          <div style={{ height: 200, background: "rgba(148,163,184,0.1)", borderRadius: 10 }} />
        </div>
      </ShareLayout>
    );
  }

  if (!compiled || compiled.error) {
    return (
      <ShareLayout title={payload.title}>
        <div style={{ background: "#7c2d12", border: "1px solid #b45309", borderRadius: 10, padding: 16, color: "#fed7aa" }}>
          Template compile error: {compiled?.error ?? "no compiled component"}
        </div>
      </ShareLayout>
    );
  }

  const Comp = compiled.Component!;
  const meta = `Sent ${fmtDate(payload.sentAt)} · expires ${fmtDate(payload.expiresAt)}`;

  return (
    <ShareLayout
      title={payload.title}
      meta={meta}
      rightSlot={
        payload.refreshable ? (
          <button
            onClick={onRefresh}
            disabled={refreshing || busy}
            style={{
              padding: "8px 14px",
              background: refreshing ? "#1e293b" : "#312e81",
              color: "#e0e7ff",
              border: "1px solid #4c1d95",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: refreshing || busy ? "wait" : "pointer",
              opacity: refreshing || busy ? 0.7 : 1,
            }}
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        ) : null
      }
    >
      {actionFeedback && (
        <div style={{ marginBottom: 10, padding: "8px 12px", background: actionFeedback.startsWith("✓") ? "#064e3b" : "#7f1d1d", color: actionFeedback.startsWith("✓") ? "#a7f3d0" : "#fecaca", borderRadius: 8, fontSize: 12 }}>
          {actionFeedback}
        </div>
      )}
      <div style={{ position: "relative", opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : "auto", transition: "opacity 0.15s" }}>
        <PublicErrorBoundary>
          <Comp data={payload.data} onAction={onAction} sendMessage={() => { /* not supported on share page */ }} theme="dark" />
        </PublicErrorBoundary>
      </div>
      <div style={{ marginTop: 24, paddingTop: 12, borderTop: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#475569", fontSize: 11 }}>
        <span>Shared from Enso · interactive snapshot</span>
        <span style={{ fontFamily: "monospace" }}>{payload.appId}</span>
      </div>
    </ShareLayout>
  );
}
