/**
 * Global Express error middleware + async handler wrapper.
 *
 * asyncHandler: wraps async route handlers so rejected promises call next(err)
 * globalErrorHandler: catches all unhandled route errors, returns structured JSON
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { EnsoError } from "./errors.js";
import { errorResponse } from "./action-log.js";

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function globalErrorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  const ensoErr = err instanceof EnsoError ? err : undefined;
  const isOperational = ensoErr?.isOperational ?? false;

  const severity = ensoErr
    ? (isOperational ? ensoErr.severity : "critical")
    : "critical";

  const status = ensoErr?.code?.includes("NOT_FOUND")
    ? 404
    : ensoErr?.code?.includes("VALIDATION")
      ? 400
      : ensoErr?.code?.includes("RATE_LIMITED")
        ? 429
        : 500;

  const clientMessage = isOperational
    ? err.message
    : "Internal server error";

  errorResponse(
    res,
    status,
    ensoErr?.category ?? "system:unhandled",
    clientMessage,
    err,
    severity,
  );
}
