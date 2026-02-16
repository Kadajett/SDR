import { resolve } from "path";
import { SERVER_PORT, GAME_DIR } from "@sdr/shared";

export function getPort(): number {
  const envPort = process.env.SDR_PORT || process.env.PORT;
  return envPort ? parseInt(envPort, 10) : SERVER_PORT;
}

export function getGamesDir(): string {
  if (process.env.SDR_GAMES_DIR) {
    return resolve(process.env.SDR_GAMES_DIR);
  }
  // Default: <repo-root>/games (works from packages/server or packages/server/dist)
  return resolve(process.cwd(), GAME_DIR);
}

export function getCorsOrigins(): string[] {
  const env = process.env.SDR_CORS_ORIGINS;
  if (env) return env.split(",").map((s) => s.trim());
  return ["http://localhost:1420", "http://localhost:5173", "http://localhost:3000"];
}
