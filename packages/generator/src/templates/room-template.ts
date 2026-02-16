export const ROOM_TEMPLATE = `import type { GeneratedRoomLogic } from "@sdr/server";
import type { GameState } from "@sdr/server";

const roomLogic: GeneratedRoomLogic = {
  onInit(state: GameState): void {
    // GENERATED: Initialize game-specific state
    // Use state.setCustom(key, value) to store game data
    // Use state.setPlayerCustom(sessionId, key, value) for per-player data
  },

  onUpdate(dt: number, state: GameState): void {
    // GENERATED: Update game state each tick
    void dt;
    void state;
  },

  onPlayerInput(
    sessionId: string,
    input: { x: number; y: number; buttons: Record<string, boolean> },
    state: GameState,
  ): void {
    // GENERATED: Handle continuous player input (movement, aim)
    void sessionId;
    void input;
    void state;
  },

  onPlayerAction(sessionId: string, action: string, data: unknown, state: GameState): void {
    // GENERATED: Handle discrete player actions (use item, attack, etc.)
    void sessionId;
    void action;
    void data;
    void state;
  },

  onPlayerJoin(sessionId: string, state: GameState): void {
    // GENERATED: Initialize new player's custom data
    void sessionId;
    void state;
  },

  onPlayerLeave(sessionId: string, state: GameState): void {
    // GENERATED: Clean up player data on disconnect
    void sessionId;
    void state;
  },

  checkWinCondition(state: GameState): string | null {
    // GENERATED: Return winner sessionId or null
    void state;
    return null;
  },
};

export default roomLogic;
`;
