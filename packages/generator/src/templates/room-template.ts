export const ROOM_TEMPLATE = `import type { GeneratedRoomLogic, RoomContext } from "@sdr/server";

const roomLogic: GeneratedRoomLogic = {
  onInit(ctx: RoomContext): void {
    // GENERATED: Initialize game-specific state
    // Use ctx.state.setCustom(key, value) to store game data
    // Use ctx.state.setPlayerCustom(sessionId, key, value) for per-player data
    // Use ctx.broadcast(type, data) to push data to all clients
    // Use ctx.send(sessionId, type, data) to push data to one client
  },

  onUpdate(dt: number, ctx: RoomContext): void {
    // GENERATED: Update game state each tick
    void dt;
    void ctx;
  },

  onPlayerInput(
    sessionId: string,
    input: { x: number; y: number; buttons: Record<string, boolean> },
    ctx: RoomContext,
  ): void {
    // GENERATED: Handle continuous player input (movement, aim)
    void sessionId;
    void input;
    void ctx;
  },

  onPlayerAction(sessionId: string, action: string, data: unknown, ctx: RoomContext): void {
    // GENERATED: Handle discrete player actions (use item, attack, etc.)
    void sessionId;
    void action;
    void data;
    void ctx;
  },

  onPlayerJoin(sessionId: string, ctx: RoomContext): void {
    // GENERATED: Initialize new player's custom data
    void sessionId;
    void ctx;
  },

  onPlayerLeave(sessionId: string, ctx: RoomContext): void {
    // GENERATED: Clean up player data on disconnect
    void sessionId;
    void ctx;
  },

  checkWinCondition(ctx: RoomContext): string | null {
    // GENERATED: Return winner sessionId or null
    void ctx;
    return null;
  },
};

export default roomLogic;
`;
