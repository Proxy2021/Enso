import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

interface RequestContext {
  requestId: string;
  startTime: number;
}

const store = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | undefined {
  return store.getStore()?.requestId;
}

export function getRequestDuration(): number | undefined {
  const ctx = store.getStore();
  return ctx ? Date.now() - ctx.startTime : undefined;
}

export function httpRequestContext(req: Request, _res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID().slice(0, 8);
  store.run({ requestId, startTime: Date.now() }, () => next());
}

export function runWithRequestId<T>(fn: () => T): { requestId: string; result: T } {
  const requestId = randomUUID().slice(0, 8);
  const result = store.run({ requestId, startTime: Date.now() }, fn);
  return { requestId, result };
}
