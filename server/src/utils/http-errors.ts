/**
 * HTTP error response helpers.
 * Replaces repeated `res.status(XXX).json({ error: "..." })` in server.ts.
 */

import type { Response } from "express";

export function sendError(
  res: Response,
  status: number,
  message: string,
  extra?: Record<string, unknown>,
): void {
  res.status(status).json({ error: message, ...extra });
}

export function send400(res: Response, message = "Bad request"): void {
  sendError(res, 400, message);
}

export function send401(res: Response, message = "Unauthorized"): void {
  sendError(res, 401, message);
}

export function send404(res: Response, message = "Not found"): void {
  sendError(res, 404, message);
}

export function send500(res: Response, message = "Internal server error"): void {
  sendError(res, 500, message);
}
