import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export interface Breadcrumb {
  ts: number;
  cat: string;
  msg: string;
}

interface RequestContext {
  requestId: string;
  startTime: number;
  orchestrationId?: string;
  taskId?: string;
  breadcrumbs: Breadcrumb[];
}

const MAX_BREADCRUMBS = 25;

const store = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | undefined {
  return store.getStore()?.requestId;
}

export function getRequestDuration(): number | undefined {
  const ctx = store.getStore();
  return ctx ? Date.now() - ctx.startTime : undefined;
}

export function addBreadcrumb(cat: string, msg: string): void {
  const ctx = store.getStore();
  if (!ctx) return;
  if (ctx.breadcrumbs.length >= MAX_BREADCRUMBS) {
    ctx.breadcrumbs.shift();
  }
  ctx.breadcrumbs.push({ ts: Date.now(), cat, msg: msg.slice(0, 120) });
}

export function getBreadcrumbs(): Breadcrumb[] {
  return store.getStore()?.breadcrumbs ?? [];
}

export function httpRequestContext(req: Request, _res: Response, next: NextFunction): void {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID().slice(0, 8);
  store.run({ requestId, startTime: Date.now(), breadcrumbs: [] }, () => next());
}

export function runWithRequestId<T>(fn: () => T): { requestId: string; result: T } {
  const requestId = randomUUID().slice(0, 8);
  const result = store.run({ requestId, startTime: Date.now(), breadcrumbs: [] }, fn);
  return { requestId, result };
}

export function getRequestContext(): Partial<RequestContext> {
  const ctx = store.getStore();
  return {
    requestId: ctx?.requestId,
    orchestrationId: ctx?.orchestrationId,
    taskId: ctx?.taskId,
  };
}

export function runWithOrchestrationContext<T>(
  orchestrationId: string,
  taskId: string,
  fn: () => T,
): T {
  const requestId = randomUUID().slice(0, 8);
  return store.run({ requestId, startTime: Date.now(), orchestrationId, taskId, breadcrumbs: [] }, fn);
}
