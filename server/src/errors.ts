/**
 * EnsoError — Structured error hierarchy for the Enso platform.
 */

import type { ErrorSeverity } from "./action-log.js";

export type ErrorCode =
  | "SYSTEM_STARTUP_FAILED"
  | "SYSTEM_HEALTH_DEGRADED"
  | "LLM_CALL_FAILED"
  | "LLM_RATE_LIMITED"
  | "LLM_PARSE_ERROR"
  | "LLM_TIMEOUT"
  | "CORTEX_INGEST_FAILED"
  | "CORTEX_SEARCH_FAILED"
  | "CORTEX_ENRICHMENT_FAILED"
  | "ORCHESTRATION_PLAN_FAILED"
  | "ORCHESTRATION_TASK_FAILED"
  | "ORCHESTRATION_DAG_ERROR"
  | "BUILD_APP_FAILED"
  | "BUILD_COMPILE_ERROR"
  | "WS_CONNECTION_ERROR"
  | "WS_MESSAGE_ERROR"
  | "AGENT_TOOL_FAILED"
  | "AGENT_ROUTING_ERROR"
  | "CLIENT_RENDER_ERROR"
  | "CLIENT_SANDBOX_ERROR"
  | "DATA_SOURCE_SCAN_FAILED"
  | "DATA_SOURCE_INGEST_FAILED"
  | "TOOL_EXECUTION_FAILED"
  | "TOOL_VALIDATION_FAILED"
  | "EXTERNAL_SERVICE_FAILED"
  | "EXTERNAL_SERVICE_TIMEOUT"
  | "WS_SEND_FAILED"
  | "VALIDATION_FAILED"
  | "FILESYSTEM_ACCESS_FAILED"
  | "SCHEDULED_TASK_FAILED"
  | "UNKNOWN_ERROR";

export class EnsoError extends Error {
  public readonly isOperational: boolean;
  public readonly metadata?: Record<string, unknown>;

  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly category: string,
    public readonly severity: ErrorSeverity = "error",
    options?: { isOperational?: boolean; cause?: Error; metadata?: Record<string, unknown> },
  ) {
    super(message, { cause: options?.cause });
    this.name = "EnsoError";
    this.isOperational = options?.isOperational ?? true;
    if (options?.metadata) {
      this.metadata = options.metadata;
    }
  }
}

export function llmError(message: string, cause?: Error): EnsoError {
  return new EnsoError(message, "LLM_CALL_FAILED", "llm:call", "error", { cause });
}

export function llmRateLimited(message: string, cause?: Error): EnsoError {
  return new EnsoError(message, "LLM_RATE_LIMITED", "llm:call", "warning", { cause });
}

export function llmTimeout(message: string, timeoutMs: number): EnsoError {
  return new EnsoError(message, "LLM_TIMEOUT", "llm:call", "warning", {
    metadata: { timeoutMs },
  });
}

export function cortexError(message: string, subpath: string, cause?: Error): EnsoError {
  return new EnsoError(message, "CORTEX_ENRICHMENT_FAILED", `cortex:${subpath}`, "error", { cause });
}

export function orchestrationError(message: string, subpath: string, cause?: Error): EnsoError {
  return new EnsoError(message, "ORCHESTRATION_TASK_FAILED", `orchestration:${subpath}`, "error", { cause });
}

export function buildError(message: string, cause?: Error): EnsoError {
  return new EnsoError(message, "BUILD_APP_FAILED", "build:app", "error", { cause });
}

export function dataSourceError(source: string, message: string, cause?: Error): EnsoError {
  return new EnsoError(message, "DATA_SOURCE_SCAN_FAILED", `data-source:${source}`, "error", { cause, metadata: { source } });
}

export function toolExecutionError(toolId: string, message: string, cause?: Error): EnsoError {
  return new EnsoError(message, "TOOL_EXECUTION_FAILED", `agent:tool`, "error", { cause, metadata: { toolId } });
}

export function externalServiceError(service: string, message: string, cause?: Error): EnsoError {
  return new EnsoError(message, "EXTERNAL_SERVICE_FAILED", `external:${service}`, "error", { cause, metadata: { service } });
}

export function validationError(field: string, message: string): EnsoError {
  return new EnsoError(message, "VALIDATION_FAILED", "system:validation", "warning", { metadata: { field } });
}

export function wsError(message: string, cause?: Error): EnsoError {
  return new EnsoError(message, "WS_SEND_FAILED", "ws:send", "warning", { cause });
}
