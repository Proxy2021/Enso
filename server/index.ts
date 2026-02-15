import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { handleConnection } from "./ws-handler.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

const server = createServer(app);

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", handleConnection);

server.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] WebSocket at ws://localhost:${PORT}/ws`);
  console.log(
    `[Server] GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? "set" : "NOT set (will use fallback UI)"}`
  );
});
