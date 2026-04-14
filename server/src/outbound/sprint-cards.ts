/**
 * sprint-cards.ts — Auto-surface sprint deliverables as interactive cards.
 *
 * When a focus area sprint completes, this module creates individual cards
 * for each deliverable plus a master "Sprint Results" card, and sends them
 * to connected clients via WebSocket.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SprintResultsSummary, SprintDeliverableSummary } from "@shared/types";
import type { ConnectedClient } from "../server.js";
import type { ResolvedEnsoAccount } from "../accounts.js";
import type { ServerMessage } from "../types.js";
import { logAction, logError } from "../action-log.js";
import { registerCardContext } from "./card-context.js";

// ── Constants ──

const ENSO_HOME = join(homedir(), ".enso");

// ── Types ──

interface DeliverableCard {
  cardId: string;
  deliverable: SprintDeliverableSummary;
  cardType: "app" | "content" | "navigation" | "assessment";
}

// ── Helpers ──

/**
 * Load the markdown content for a Cortex entity from its wiki page.
 * Returns null if the entity has no wiki page or the file doesn't exist.
 */
async function loadEntityContent(entityId: string): Promise<string | null> {
  try {
    const { lookupEntity } = await import("../entity-model.js");
    const entry = lookupEntity(entityId);
    if (!entry?.cortexPath) return null;

    const wikiPath = join(ENSO_HOME, "wiki", entry.cortexPath);
    if (!existsSync(wikiPath)) return null;

    return readFileSync(wikiPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Try to find an app by entity ID and return its tool family.
 * Apps registered as Cortex entities use the pattern "cortex:app:<slug>".
 */
async function findAppByEntityId(entityId: string): Promise<{ toolFamily: string } | null> {
  try {
    const { loadAllApps } = await import("../app-persistence.js");
    const apps = loadAllApps();

    // Entity IDs for apps follow pattern "cortex:app:<slug>" or contain the toolFamily
    const slug = entityId.split(":").pop() ?? "";
    const app = apps.find(a =>
      a.spec.toolFamily === slug
      || a.spec.toolFamily === entityId
      || entityId.endsWith(`:${a.spec.toolFamily}`)
    );

    return app ? { toolFamily: app.spec.toolFamily } : null;
  } catch {
    return null;
  }
}

/**
 * Build a card data object for a single deliverable, appropriate to its type.
 */
async function buildDeliverableCardData(d: SprintDeliverableSummary, focusId: string): Promise<{
  data: Record<string, unknown>;
  cardType: DeliverableCard["cardType"];
}> {
  const base = {
    _source: "sprint-deliverable",
    focusId,
    entityId: d.entityId,
    entityType: d.entityType,
    taskTitle: d.taskTitle,
    painPoint: d.painPoint,
    howItHelps: d.howItHelps,
    quickStart: d.quickStart,
    actionType: d.actionType,
  };

  switch (d.actionType) {
    case "run": {
      const appInfo = d.entityType === "app" ? await findAppByEntityId(d.entityId) : null;
      return {
        data: {
          ...base,
          ...(appInfo ? { toolFamily: appInfo.toolFamily, canRun: true } : { canRun: false }),
        },
        cardType: "app",
      };
    }

    case "read": {
      const content = await loadEntityContent(d.entityId);
      return {
        data: {
          ...base,
          content: content ?? `*Content for ${d.taskTitle} is available in the Cortex wiki.*`,
          hasContent: !!content,
        },
        cardType: "content",
      };
    }

    case "explore": {
      return {
        data: {
          ...base,
          navigateTo: d.entityId,
        },
        cardType: "navigation",
      };
    }

    case "review": {
      return {
        data: {
          ...base,
          reviewTarget: d.entityId,
        },
        cardType: "assessment",
      };
    }

    default:
      return { data: base, cardType: "content" };
  }
}

/**
 * Build the master Sprint Results card data that lists all deliverables
 * with their status and quick-launch actions.
 */
function buildMasterCardData(
  summary: SprintResultsSummary,
  focusId: string,
  deliverableCards: DeliverableCard[],
): Record<string, unknown> {
  return {
    _source: "sprint-results",
    focusId,
    sprintSummary: summary.sprintSummary,
    recommendedFirstAction: summary.recommendedFirstAction,
    nextSteps: summary.nextSteps,
    deliverables: deliverableCards.map((dc, i) => ({
      cardId: dc.cardId,
      taskTitle: dc.deliverable.taskTitle,
      entityType: dc.deliverable.entityType,
      actionType: dc.deliverable.actionType,
      painPoint: dc.deliverable.painPoint,
      howItHelps: dc.deliverable.howItHelps,
      quickStart: dc.deliverable.quickStart,
      isRecommended: i === (summary.recommendedFirstAction?.deliverableIndex ?? -1),
      cardType: dc.cardType,
    })),
  };
}

// ── Master Sprint Results Template ──

const SPRINT_RESULTS_TEMPLATE = `
function SprintResultsCard({ data }) {
  const deliverables = data.deliverables || [];
  const recommended = data.recommendedFirstAction;

  return (
    <div style={{ padding: '16px', fontFamily: '-apple-system, sans-serif' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '18px', fontWeight: '700', color: '#10b981', marginBottom: '8px' }}>
          ✅ Sprint Complete
        </div>
        <div style={{ fontSize: '14px', color: '#d1d5db', lineHeight: '1.6' }}>
          {data.sprintSummary}
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
          Deliverables
        </div>
        {deliverables.map((d, i) => {
          const colors = { app: '#10b981', article: '#3b82f6', idea: '#f59e0b', synthesis: '#8b5cf6' };
          const color = colors[d.entityType] || '#6b7280';
          const icons = { run: '▶', read: '📖', explore: '🔍', review: '📋' };
          return (
            <div key={i} style={{
              padding: '12px',
              borderLeft: '3px solid ' + color,
              background: '#1f2937',
              borderRadius: '0 8px 8px 0',
              marginBottom: '8px',
              cursor: 'pointer',
            }}
              onClick={() => actions.emit('open_deliverable', { cardId: d.cardId, index: i })}
            >
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#f9fafb' }}>
                {icons[d.actionType] || '📄'} {d.taskTitle}
                <span style={{ fontSize: '11px', color: color, marginLeft: '8px' }}>{d.entityType}</span>
                {d.isRecommended && (
                  <span style={{ fontSize: '11px', color: '#10b981', marginLeft: '8px' }}>⭐ START HERE</span>
                )}
              </div>
              <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>{d.painPoint}</div>
              <div style={{ fontSize: '13px', color: '#d1d5db', marginTop: '4px' }}>{d.howItHelps}</div>
              <div style={{ fontSize: '12px', color: '#a78bfa', marginTop: '6px' }}>→ {d.quickStart}</div>
            </div>
          );
        })}
      </div>

      {data.nextSteps && data.nextSteps.length > 0 && (
        <div>
          <div style={{ fontSize: '12px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
            Next Steps
          </div>
          {data.nextSteps.map((step, i) => (
            <div key={i} style={{ fontSize: '13px', color: '#d1d5db', marginBottom: '4px', paddingLeft: '12px' }}>
              • {step}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
`.trim();

// ── Public API ──

/**
 * Create interactive cards for each sprint deliverable and a master results card.
 * Sends all cards to the connected client via WebSocket.
 *
 * @param summary - The sprint results summary from the Evolve phase
 * @param focusId - The focus area ID that completed the sprint
 * @param client - Connected WebSocket client to send cards to
 * @param account - Resolved account for card context registration
 * @returns Array of created card IDs (master card first, then deliverables)
 */
export async function surfaceSprintDeliverables(
  summary: SprintResultsSummary,
  focusId: string,
  client: ConnectedClient,
  account: ResolvedEnsoAccount,
): Promise<string[]> {
  const cardIds: string[] = [];

  if (!summary.deliverables?.length) {
    logAction({ ts: Date.now(), type: "action", category: "sprint-cards", message: `No deliverables to surface for focus ${focusId}` });
    return cardIds;
  }

  logAction({ ts: Date.now(), type: "action", category: "sprint-cards", message: `Surfacing ${summary.deliverables.length} deliverables for focus ${focusId}` });

  // 1. Create individual deliverable cards
  const deliverableCards: DeliverableCard[] = [];

  for (const deliverable of summary.deliverables) {
    try {
      const cardId = randomUUID();
      const { data, cardType } = buildDeliverableCardData(deliverable, focusId);

      registerCardContext(cardId, {
        cardId,
        originalPrompt: `Sprint deliverable: ${deliverable.taskTitle}`,
        originalResponse: deliverable.howItHelps,
        currentData: structuredClone(data),
        geminiApiKey: account.geminiApiKey,
        account,
        mode: "full",
        actionHistory: [],
        interactionMode: "llm",
        toolFamily: undefined,
        signatureId: undefined,
        coverageStatus: undefined,
      });

      deliverableCards.push({ cardId, deliverable, cardType });
      cardIds.push(cardId);

      // Send individual deliverable card as text message
      const msg: ServerMessage = {
        id: cardId,
        runId: randomUUID(),
        sessionKey: client.sessionKey,
        seq: 0,
        state: "final",
        text: formatDeliverableText(deliverable),
        data,
        timestamp: Date.now(),
      };
      client.send(msg);

      logAction({ ts: Date.now(), type: "action", category: "sprint-cards", message: `Created ${cardType} card ${cardId} for "${deliverable.taskTitle}"` });
    } catch (err) {
      logError("sprint-cards", `Failed to create card for deliverable "${deliverable.taskTitle}"`, err);
    }
  }

  // 2. Create the master Sprint Results card
  try {
    const masterCardId = randomUUID();
    const masterData = buildMasterCardData(summary, focusId, deliverableCards);

    registerCardContext(masterCardId, {
      cardId: masterCardId,
      originalPrompt: `Sprint results for focus area ${focusId}`,
      originalResponse: summary.sprintSummary,
      currentData: structuredClone(masterData),
      geminiApiKey: account.geminiApiKey,
      account,
      mode: "full",
      actionHistory: [],
      interactionMode: "tool",
      toolFamily: "sprint_results",
      signatureId: "sprint_results_summary",
      coverageStatus: "covered",
    });

    const masterMsg: ServerMessage = {
      id: masterCardId,
      runId: randomUUID(),
      sessionKey: client.sessionKey,
      seq: 0,
      state: "final",
      data: masterData,
      generatedUI: SPRINT_RESULTS_TEMPLATE,
      cardMode: {
        interactionMode: "tool",
        toolFamily: "sprint_results",
        signatureId: "sprint_results_summary",
        coverageStatus: "covered",
      },
      timestamp: Date.now(),
    };
    client.send(masterMsg);

    cardIds.unshift(masterCardId); // Master card first
    logAction({ ts: Date.now(), type: "action", category: "sprint-cards", message: `Created master sprint results card ${masterCardId} with ${deliverableCards.length} deliverables` });
  } catch (err) {
    logError("sprint-cards", "Failed to create master sprint results card", err);
  }

  logAction({ ts: Date.now(), type: "action", category: "sprint-cards", message: `Surfaced ${cardIds.length} cards for focus ${focusId}` });
  return cardIds;
}

/**
 * Format a deliverable as a readable text message for chat display.
 */
function formatDeliverableText(d: SprintDeliverableSummary): string {
  const icons: Record<string, string> = { run: "▶️", read: "📖", explore: "🔍", review: "📋" };
  const typeIcons: Record<string, string> = { app: "📱", article: "📝", idea: "💡", synthesis: "🔬" };
  return [
    `${icons[d.actionType] ?? "📄"} **${d.taskTitle}** ${typeIcons[d.entityType] ?? ""}`,
    "",
    d.howItHelps,
    "",
    `→ ${d.quickStart}`,
  ].join("\n");
}
