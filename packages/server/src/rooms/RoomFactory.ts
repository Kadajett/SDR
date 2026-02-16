import { resolve } from "path";
import { pathToFileURL } from "url";
import type { GameMetadata } from "@sdr/shared";
import type { GameState } from "../state/GameState.js";
import { getGamesDir } from "../config.js";

/**
 * Context passed to generated room logic on every callback.
 * Wraps GameState with messaging capabilities so game logic
 * can push arbitrary data (ECS snapshots, events, etc.) to clients.
 */
export interface RoomContext {
  state: GameState;
  /** Send a message to all connected clients. */
  broadcast(type: string, data: unknown): void;
  /** Send a message to a single client by sessionId. */
  send(sessionId: string, type: string, data: unknown): void;
  /** Elapsed time in ms since room creation. */
  elapsedTime: number;
}

/**
 * Contract for generated game server logic.
 * All callbacks receive a RoomContext so game code can both
 * read/write state AND push messages (ECS sync, events, etc.).
 */
export interface GeneratedRoomLogic {
  onInit?: (ctx: RoomContext) => void;
  onUpdate: (dt: number, ctx: RoomContext) => void;
  onPlayerInput?: (
    sessionId: string,
    input: { x: number; y: number; buttons: Record<string, boolean> },
    ctx: RoomContext,
  ) => void;
  onPlayerAction: (
    sessionId: string,
    action: string,
    data: unknown,
    ctx: RoomContext,
  ) => void;
  onPlayerJoin?: (sessionId: string, ctx: RoomContext) => void;
  onPlayerLeave?: (sessionId: string, ctx: RoomContext) => void;
  checkWinCondition: (ctx: RoomContext) => string | null;
}

export class RoomFactory {
  private static cache = new Map<string, GeneratedRoomLogic>();

  static async loadRoom(gameDate: string): Promise<GeneratedRoomLogic | null> {
    if (this.cache.has(gameDate)) {
      return this.cache.get(gameDate)!;
    }

    try {
      const gamesDir = getGamesDir();
      const modulePath = resolve(gamesDir, gameDate, "server", "room.js");
      const moduleUrl = pathToFileURL(modulePath).href;
      const mod = await import(moduleUrl);
      const logic: GeneratedRoomLogic = mod.default;
      this.cache.set(gameDate, logic);
      return logic;
    } catch (err) {
      console.error(`Failed to load room for ${gameDate}:`, err);
      return null;
    }
  }

  static clearCache(): void {
    this.cache.clear();
  }
}
