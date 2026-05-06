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
  | "AUTH_INVALID"
  | "AUTH_EXPIRED"
  | "AUTH_MISSING"
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

// ── Auth Error Infrastructure ──

export type AuthErrorCode = "AUTH_INVALID" | "AUTH_EXPIRED" | "AUTH_MISSING";
export type AuthType = "token" | "api-key" | "oauth" | "app-password";

export interface RecoveryAction {
  type: "check-settings" | "re-authorize" | "update-key" | "wait" | "contact-admin" | "auto-retry";
  label: string;
  action?: string;
  seconds?: number;
}

export interface AuthErrorPayload {
  code: AuthErrorCode;
  service: string;
  userMessage: string;
  recovery?: RecoveryAction;
  retryAfter?: number;
}

export class AuthError extends EnsoError {
  public readonly service: string;
  public readonly authType: AuthType;
  public readonly recoveryAction: RecoveryAction;
  public readonly retryAfter?: number;

  constructor(
    message: string,
    code: AuthErrorCode,
    service: string,
    authType: AuthType,
    recoveryAction: RecoveryAction,
    options?: { cause?: Error; retryAfter?: number },
  ) {
    super(message, code, `auth:${service}`, "error", { cause: options?.cause, isOperational: true });
    this.name = "AuthError";
    this.service = service;
    this.authType = authType;
    this.recoveryAction = recoveryAction;
    this.retryAfter = options?.retryAfter;
  }

  toPayload(): AuthErrorPayload {
    return {
      code: this.code as AuthErrorCode,
      service: this.service,
      userMessage: this.message,
      recovery: this.recoveryAction,
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * Classify an HTTP error response as an auth failure. Returns an AuthError if
 * the response indicates an authentication/authorization problem, or null if
 * it's a different kind of error (transient, rate-limit, server error, etc.).
 */
export function classifyAuthError(status: number, body: any, service: string): AuthError | null {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body ?? "");

  if (service === "enso") {
    if (status === 401) {
      if (bodyStr.includes("missing") || bodyStr.includes("no token")) {
        return new AuthError(
          "Connection requires an access token",
          "AUTH_MISSING", "enso", "token",
          { type: "check-settings", label: "Update Connection", action: "open-connection-picker" },
        );
      }
      return new AuthError(
        "Access token is incorrect",
        "AUTH_INVALID", "enso", "token",
        { type: "check-settings", label: "Update Connection", action: "open-connection-picker" },
      );
    }
    return null;
  }

  if (service === "youtube") {
    if (status === 401) {
      if (bodyStr.includes("invalid_grant") || bodyStr.includes("Token has been expired")) {
        return new AuthError(
          "YouTube access expired",
          "AUTH_EXPIRED", "youtube", "oauth",
          { type: "re-authorize", label: "Re-authorize YouTube", action: "youtube-reauth" },
        );
      }
      if (bodyStr.includes("invalid_client")) {
        return new AuthError(
          "YouTube app credentials changed",
          "AUTH_INVALID", "youtube", "oauth",
          { type: "contact-admin", label: "Contact Administrator" },
        );
      }
      return new AuthError(
        "YouTube authentication failed",
        "AUTH_INVALID", "youtube", "oauth",
        { type: "re-authorize", label: "Re-authorize YouTube", action: "youtube-reauth" },
      );
    }
    return null;
  }

  if (service === "gemini" || service === "openai") {
    const displayName = "AI service";
    if (status === 401) {
      return new AuthError(
        `${displayName} API key is invalid`,
        "AUTH_INVALID", service, "api-key",
        { type: "update-key", label: "Update API Key", action: "update-env" },
      );
    }
    if (status === 403 && (bodyStr.includes("quota") || bodyStr.includes("insufficient"))) {
      return new AuthError(
        `${displayName} quota exceeded`,
        "AUTH_EXPIRED", service, "api-key",
        { type: "wait", label: "Wait for Quota Reset", seconds: 3600 },
        { retryAfter: 3600 },
      );
    }
    return null;
  }

  if (service === "wechat") {
    if (bodyStr.includes("access_token expired") || bodyStr.includes("40001") || bodyStr.includes("40014")) {
      return new AuthError(
        "WeChat token expired",
        "AUTH_EXPIRED", "wechat", "token",
        { type: "auto-retry", label: "Refreshing..." },
      );
    }
    return null;
  }

  if (service === "smtp" || service === "gmail") {
    if (status === 401 || bodyStr.includes("auth") || bodyStr.includes("535")) {
      return new AuthError(
        "Email login failed",
        "AUTH_INVALID", "smtp", "app-password",
        { type: "update-key", label: "Update App Password", action: "update-env" },
      );
    }
    return null;
  }

  if (service === "brave") {
    if (status === 401 || status === 403) {
      return new AuthError(
        "Search API key is invalid",
        "AUTH_INVALID", "brave", "api-key",
        { type: "update-key", label: "Update API Key", action: "update-env" },
      );
    }
    return null;
  }

  if (service === "cloudflare") {
    if (status === 401 || status === 403) {
      return new AuthError(
        "Tunnel API access denied",
        "AUTH_INVALID", "cloudflare", "api-key",
        { type: "update-key", label: "Update API Token", action: "update-env" },
      );
    }
    return null;
  }

  // Generic fallback for unknown services
  if (status === 401 || status === 403) {
    return new AuthError(
      `Authentication failed for ${service}`,
      "AUTH_INVALID", service, "api-key",
      { type: "update-key", label: "Update Credentials", action: "update-env" },
    );
  }

  return null;
}
