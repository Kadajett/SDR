import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import express from "express";
import { createServer } from "http";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import type { GameMetadata } from "@sdr/shared";
import { GameRoom } from "./rooms/GameRoom.js";
import { getPort, getGamesDir, getCorsOrigins } from "./config.js";

const app = express();
const port = getPort();
const gamesDir = getGamesDir();

app.use(express.json());

// CORS
const allowedOrigins = new Set(getCorsOrigins());
app.use((_req, res, next) => {
  const origin = _req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Serve generated game assets
app.use("/games", express.static(gamesDir));

async function loadGameMetadata(gameDate: string): Promise<GameMetadata | null> {
  try {
    const metaPath = join(gamesDir, gameDate, "metadata.json");
    const raw = await readFile(metaPath, "utf-8");
    return JSON.parse(raw) as GameMetadata;
  } catch {
    return null;
  }
}

async function listAllGames(): Promise<GameMetadata[]> {
  try {
    const entries = await readdir(gamesDir, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse();

    const games: GameMetadata[] = [];
    for (const dir of dirs) {
      const meta = await loadGameMetadata(dir);
      if (meta) games.push(meta);
    }
    return games;
  } catch {
    return [];
  }
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", gamesDir, uptime: process.uptime() });
});

// API: list available games
app.get("/api/games", async (_req, res) => {
  const games = await listAllGames();
  res.json({ games });
});

// API: current (today's) game info
app.get("/api/games/current", async (_req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const game = await loadGameMetadata(today);
  res.json({ game });
});

// API: specific game by date
app.get("/api/games/:date", async (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Invalid date format, use YYYY-MM-DD" });
    return;
  }
  const game = await loadGameMetadata(date);
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }
  res.json({ game });
});

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Register the base game room
gameServer.define("game", GameRoom);

httpServer.listen(port, () => {
  console.log(`Game server listening on port ${port}`);
  console.log(`Games directory: ${gamesDir}`);
});

// Graceful shutdown
function shutdown() {
  console.log("Shutting down...");
  gameServer.gracefullyShutdown().then(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
