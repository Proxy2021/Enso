/**
 * Lightweight circuit breaker for external API calls (LLM, Brave Search, etc.).
 * Three states: closed (normal) → open (failing, use fallback) → half-open (probe).
 */
import { logAction, logError } from "./action-log.js";
import { EnsoError } from "./errors.js";

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerOpts {
  name: string;
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxProbes: number;
}

const DEFAULT_OPTS: Omit<CircuitBreakerOpts, "name"> = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxProbes: 2,
};

const registry = new Map<string, CircuitBreaker>();

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private halfOpenSuccesses = 0;
  private lastFailureTime = 0;
  private readonly opts: CircuitBreakerOpts;

  constructor(opts: Partial<CircuitBreakerOpts> & { name: string }) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
    registry.set(opts.name, this);
  }

  getState(): { state: CircuitState; failures: number; lastFailureTime: number } {
    return { state: this.state, failures: this.failures, lastFailureTime: this.lastFailureTime };
  }

  async execute<T>(fn: () => Promise<T>, fallback?: () => T): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > this.opts.resetTimeoutMs) {
        this.state = "half-open";
        this.halfOpenSuccesses = 0;
      } else {
        logError("circuit-breaker", `${this.opts.name} circuit OPEN — using fallback`, undefined, { severity: "warning" });
        if (fallback) return fallback();
        throw new EnsoError(
          `${this.opts.name} circuit is open — service unavailable`,
          "EXTERNAL_SERVICE_FAILED",
          `circuit:${this.opts.name}`,
          "warning",
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.opts.halfOpenMaxProbes) {
        this.state = "closed";
        this.failures = 0;
        logAction({ ts: Date.now(), type: "system", category: `circuit:${this.opts.name}`,
          message: `Circuit breaker ${this.opts.name} recovered to CLOSED` });
      }
    } else {
      this.failures = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.opts.failureThreshold) {
      this.state = "open";
      logAction({ ts: Date.now(), type: "system", category: `circuit:${this.opts.name}`,
        message: `Circuit breaker ${this.opts.name} tripped OPEN after ${this.failures} failures`, severity: "warning" });
      logError("circuit-breaker", `${this.opts.name} circuit tripped OPEN after ${this.failures} failures`, undefined, { severity: "warning" });
    }
  }

  /**
   * Trip the breaker immediately on auth failure (401/403).
   * Skips the normal failure count threshold — auth errors are deterministic,
   * not transient, so retrying is wasteful.
   */
  recordAuthFailure(reason: string): void {
    this.failures = this.opts.failureThreshold;
    this.lastFailureTime = Date.now();
    this.state = "open";
    logError("circuit-breaker", `${this.opts.name} circuit tripped OPEN immediately — auth failure: ${reason}`, undefined, { severity: "warning" });
  }
}

export const llmCircuit = new CircuitBreaker({ name: "llm", failureThreshold: 5, resetTimeoutMs: 30_000, halfOpenMaxProbes: 2 });
export const braveSearchCircuit = new CircuitBreaker({ name: "brave-search", failureThreshold: 3, resetTimeoutMs: 60_000, halfOpenMaxProbes: 2 });

export function getCircuitBreakerStates(): Array<{ name: string; state: string; failures: number; lastFailureTime: number }> {
  const result: Array<{ name: string; state: string; failures: number; lastFailureTime: number }> = [];
  for (const [name, cb] of registry) {
    result.push({ name, ...cb.getState() });
  }
  return result;
}
