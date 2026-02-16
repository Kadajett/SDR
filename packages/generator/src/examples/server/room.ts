/**
 * EXAMPLE SERVER ROOM: Grassland Gem Rush
 *
 * This is a REFERENCE IMPLEMENTATION demonstrating the server-side room
 * logic pattern for generated games. The server is AUTHORITATIVE for
 * scores, win conditions, and item spawns.
 *
 * Generated room files implement the GeneratedRoomLogic interface
 * which the GameRoom loads dynamically via RoomFactory.
 *
 * This example uses the RoomContext API:
 * - ctx.state.setCustom / getCustom for game-level state
 * - ctx.state.setPlayerCustom / getPlayerCustom for per-player state
 * - ctx.broadcast(type, data) to push data to all clients
 * - ctx.send(sessionId, type, data) to push data to one client
 */

// Type stubs for the server API. In real generated code these
// come from @sdr/server, but the example avoids a circular import.
interface GameState {
  phase: string;
  timer: number;
  setCustom(key: string, value: unknown): void;
  getCustom<T>(key: string): T | undefined;
  getCustomOr<T>(key: string, defaultValue: T): T;
  setPlayerCustom(sessionId: string, key: string, value: unknown): void;
  getPlayerCustom<T>(sessionId: string, key: string): T | undefined;
  getPlayers(): Array<{ sessionId: string; name: string }>;
}

interface RoomContext {
  state: GameState;
  broadcast(type: string, data: unknown): void;
  send(sessionId: string, type: string, data: unknown): void;
  elapsedTime: number;
}

interface GeneratedRoomLogic {
  onInit?: (ctx: RoomContext) => void;
  onUpdate: (dt: number, ctx: RoomContext) => void;
  onPlayerInput?: (
    sessionId: string,
    input: { x: number; y: number; buttons: Record<string, boolean> },
    ctx: RoomContext,
  ) => void;
  onPlayerAction: (sessionId: string, action: string, data: unknown, ctx: RoomContext) => void;
  onPlayerJoin?: (sessionId: string, ctx: RoomContext) => void;
  onPlayerLeave?: (sessionId: string, ctx: RoomContext) => void;
  checkWinCondition: (ctx: RoomContext) => string | null;
}

const WIN_SCORE = 10;
const GAME_DURATION = 180; // 3 minutes
const GEM_COUNT = 8;
const MAP_MIN = 96;
const MAP_MAX_X = 1184;
const MAP_MAX_Y = 704;
const COLLECT_RADIUS = 20;

interface Gem {
  id: number;
  x: number;
  y: number;
  points: number;
}

function spawnGem(gems: Gem[], nextId: number): { gem: Gem; nextId: number } {
  const gem: Gem = {
    id: nextId,
    x: MAP_MIN + Math.random() * (MAP_MAX_X - MAP_MIN),
    y: MAP_MIN + Math.random() * (MAP_MAX_Y - MAP_MIN),
    points: 1,
  };
  gems.push(gem);
  return { gem, nextId: nextId + 1 };
}

const roomLogic: GeneratedRoomLogic = {
  onInit(ctx: RoomContext): void {
    const { state } = ctx;
    state.setCustom("roundTimer", GAME_DURATION);
    state.setCustom("nextGemId", 0);

    const gems: Gem[] = [];
    let nextId = 0;
    for (let i = 0; i < GEM_COUNT; i++) {
      const result = spawnGem(gems, nextId);
      nextId = result.nextId;
    }
    state.setCustom("gems", gems);
    state.setCustom("nextGemId", nextId);

    for (const player of state.getPlayers()) {
      state.setPlayerCustom(player.sessionId, "score", 0);
      state.setPlayerCustom(player.sessionId, "x", 640);
      state.setPlayerCustom(player.sessionId, "y", 400);
    }

    // Broadcast initial gem positions to all clients
    ctx.broadcast("ecs:sync", { entities: gems });
  },

  onUpdate(dt: number, ctx: RoomContext): void {
    const { state } = ctx;
    const timer = state.getCustomOr("roundTimer", GAME_DURATION);
    const newTimer = timer - dt / 1000;
    state.setCustom("roundTimer", Math.max(0, newTimer));

    if (newTimer <= 0) {
      state.phase = "finished";
      return;
    }

    const gems = state.getCustomOr<Gem[]>("gems", []);
    let nextGemId = state.getCustomOr("nextGemId", 0);
    let gemsChanged = false;

    for (const player of state.getPlayers()) {
      const px = state.getPlayerCustom<number>(player.sessionId, "x") ?? 0;
      const py = state.getPlayerCustom<number>(player.sessionId, "y") ?? 0;
      const collectedIndices: number[] = [];

      for (let i = 0; i < gems.length; i++) {
        const gem = gems[i];
        const dx = px - gem.x;
        const dy = py - gem.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < COLLECT_RADIUS) {
          const score = state.getPlayerCustom<number>(player.sessionId, "score") ?? 0;
          state.setPlayerCustom(player.sessionId, "score", score + gem.points);
          collectedIndices.push(i);
        }
      }

      for (let i = collectedIndices.length - 1; i >= 0; i--) {
        gems.splice(collectedIndices[i], 1);
        const result = spawnGem(gems, nextGemId);
        nextGemId = result.nextId;
        gemsChanged = true;
      }
    }

    state.setCustom("gems", gems);
    state.setCustom("nextGemId", nextGemId);

    // Only broadcast ECS sync when entities changed
    if (gemsChanged) {
      ctx.broadcast("ecs:sync", { entities: gems });
    }
  },

  onPlayerInput(
    sessionId: string,
    input: { x: number; y: number; buttons: Record<string, boolean> },
    ctx: RoomContext,
  ): void {
    const { state } = ctx;
    const x = state.getPlayerCustom<number>(sessionId, "x") ?? 0;
    const y = state.getPlayerCustom<number>(sessionId, "y") ?? 0;
    const speed = 5;
    state.setPlayerCustom(sessionId, "x", Math.max(MAP_MIN, Math.min(MAP_MAX_X, x + input.x * speed)));
    state.setPlayerCustom(sessionId, "y", Math.max(MAP_MIN, Math.min(MAP_MAX_Y, y + input.y * speed)));
  },

  onPlayerAction(
    _sessionId: string,
    _action: string,
    _data: unknown,
    _ctx: RoomContext,
  ): void {
    // Gem Rush has no discrete actions, input is handled via onPlayerInput
  },

  onPlayerJoin(sessionId: string, ctx: RoomContext): void {
    const { state } = ctx;
    state.setPlayerCustom(sessionId, "score", 0);
    state.setPlayerCustom(sessionId, "x", 640);
    state.setPlayerCustom(sessionId, "y", 400);
  },

  checkWinCondition(ctx: RoomContext): string | null {
    const { state } = ctx;
    for (const player of state.getPlayers()) {
      const score = state.getPlayerCustom<number>(player.sessionId, "score") ?? 0;
      if (score >= WIN_SCORE) {
        return player.sessionId;
      }
    }

    const timer = state.getCustomOr("roundTimer", GAME_DURATION);
    if (timer <= 0) {
      let bestId: string | null = null;
      let bestScore = -1;
      for (const player of state.getPlayers()) {
        const score = state.getPlayerCustom<number>(player.sessionId, "score") ?? 0;
        if (score > bestScore) {
          bestScore = score;
          bestId = player.sessionId;
        }
      }
      return bestId;
    }

    return null;
  },
};

export default roomLogic;
