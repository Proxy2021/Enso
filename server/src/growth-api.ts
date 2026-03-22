/**
 * growth-api.ts — Stub router for Growth Marketing & Sales API.
 *
 * Provides placeholder endpoints so `server.ts` can `import("./growth-api.js")`
 * without crashing. Replace with real implementation when requirements are defined.
 */

import { Router } from "express";

const router = Router();

router.get("/metrics", (_req, res) => {
  res.json({ status: "not_implemented", metrics: {} });
});

router.get("/status", (_req, res) => {
  res.json({ status: "planned", version: "0.0.1" });
});

export default router;
