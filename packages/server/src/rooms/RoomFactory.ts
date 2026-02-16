import type { GameMetadata } from "@sdr/shared";
import type { GameState } from "../state/GameState.js";

export interface GeneratedRoomLogic {
  onInit?: (state: GameState) => void;
  onUpdate: (dt: number, state: GameState) => void;
  onPlayerInput?: (
    sessionId: string,
    input: { x: number; y: number; buttons: Record<string, boolean> },
    state: GameState,
  ) => void;
  onPlayerAction: (sessionId: string, action: string, data: unknown, state: GameState) => void;
  onPlayerJoin?: (sessionId: string, state: GameState) => void;
  onPlayerLeave?: (sessionId: string, state: GameState) => void;
  checkWinCondition: (state: GameState) => string | null;
}

export class RoomFactory {
  private static cache = new Map<string, GeneratedRoomLogic>();

  static async loadRoom(gameDate: string): Promise<GeneratedRoomLogic | null> {
    if (this.cache.has(gameDate)) {
      return this.cache.get(gameDate)!;
    }

    try {
      const modulePath = `../../games/${gameDate}/server/room.js`;
      const mod = await import(modulePath);
      const logic: GeneratedRoomLogic = mod.default;
      this.cache.set(gameDate, logic);
      return logic;
    } catch (err) {
      console.error(`Failed to load room for ${gameDate}:`, err);
      return null;
    }
  }

  static async getGameMetadata(gameDate: string): Promise<GameMetadata | null> {
    try {
      const metaPath = `../../games/${gameDate}/metadata.json`;
      const mod = await import(metaPath, { with: { type: "json" } });
      return mod.default as GameMetadata;
    } catch {
      return null;
    }
  }

  static clearCache(): void {
    this.cache.clear();
  }
}
