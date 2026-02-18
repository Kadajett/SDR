import type { GeneratedRoomLogic, RoomContext } from "@sdr/server";

interface StoneEntity {
  eid: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  ownerId: string;
  power: number;
  growing: boolean;
}

let nextEid = 1;
const stones: Map<number, StoneEntity> = new Map();
const playerPositions: Map<string, { x: number; y: number }> = new Map();

function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function getClosestStone(ctx: RoomContext): { sessionId: string; distance: number } | null {
  const targetX = 640;
  const targetY = 150;
  let closest: { sessionId: string; distance: number } | null = null;

  for (const stone of stones.values()) {
    const dist = distance(stone.x, stone.y, targetX, targetY);
    if (!closest || dist < closest.distance) {
      closest = { sessionId: stone.ownerId, distance: dist };
    }
  }

  return closest;
}

function broadcastEntities(ctx: RoomContext): void {
  const entities = Array.from(stones.values()).map((stone: StoneEntity) => ({
    eid: stone.eid,
    x: stone.x,
    y: stone.y,
    dx: stone.dx,
    dy: stone.dy,
    type: "stone" as const,
    ownerId: stone.ownerId,
    power: stone.power,
    growing: stone.growing,
  }));

  ctx.broadcast("entityUpdate", entities);
}

const roomLogic: GeneratedRoomLogic = {
  onInit(ctx: RoomContext): void {
    ctx.state.setCustom("round", 1);
    ctx.state.setCustom("maxRounds", 3);
    ctx.state.setCustom("roundTimer", 45);
    ctx.state.setCustom("targetX", 640);
    ctx.state.setCustom("targetY", 150);

    const players = ctx.state.getPlayers();
    const spacing = 1200 / (players.length + 1);
    players.forEach((player: { sessionId: string; name: string }, index: number) => {
      const x = 40 + spacing * (index + 1);
      const y = 750;
      ctx.state.setPlayerCustom(player.sessionId, "x", x);
      ctx.state.setPlayerCustom(player.sessionId, "y", y);
      ctx.state.setPlayerCustom(player.sessionId, "hasThrown", false);
      ctx.state.setPlayerCustom(player.sessionId, "growthRayUsed", false);
      playerPositions.set(player.sessionId, { x, y });
    });
  },

  onUpdate(dt: number, ctx: RoomContext): void {
    const roundTimer = ctx.state.getCustom<number>("roundTimer") || 45;
    const newTimer = Math.max(0, roundTimer - dt);
    ctx.state.setCustom("roundTimer", newTimer);

    // Update stones
    for (const stone of stones.values()) {
      stone.x += stone.dx * dt;
      stone.y += stone.dy * dt;

      // Apply friction
      const friction = 0.98;
      stone.dx *= friction;
      stone.dy *= friction;

      // Stop if too slow
      if (Math.abs(stone.dx) < 1 && Math.abs(stone.dy) < 1) {
        stone.dx = 0;
        stone.dy = 0;
      }

      // Bounds
      if (stone.x < 40 || stone.x > 1240) {
        stone.dx = 0;
        stone.x = Math.max(40, Math.min(1240, stone.x));
      }
      if (stone.y < 50 || stone.y > 750) {
        stone.dy = 0;
        stone.y = Math.max(50, Math.min(750, stone.y));
      }

      // Growth ray
      if (stone.growing) {
        stone.power = Math.min(1, stone.power + dt * 0.5);
      }
    }

    // Check if all players have thrown
    const players = ctx.state.getPlayers();
    const allThrown = players.every((p: { sessionId: string }) => 
      ctx.state.getPlayerCustom<boolean>(p.sessionId, "hasThrown") === true
    );

    // End round if timer expires or all thrown
    if (newTimer <= 0 || allThrown) {
      const closest = getClosestStone(ctx);
      if (closest) {
        const winner = players.find((p: { sessionId: string }) => p.sessionId === closest.sessionId);
        if (winner) {
          const currentScore = ctx.state.getCustom<number>(`score_${winner.sessionId}`) || 0;
          ctx.state.setCustom(`score_${winner.sessionId}`, currentScore + 1);
        }
      }

      // Next round
      const round = ctx.state.getCustom<number>("round") || 1;
      const maxRounds = ctx.state.getCustom<number>("maxRounds") || 3;

      if (round >= maxRounds) {
        ctx.state.phase = "finished";
      } else {
        ctx.state.setCustom("round", round + 1);
        ctx.state.setCustom("roundTimer", 45);
        stones.clear();
        players.forEach((player: { sessionId: string }) => {
          ctx.state.setPlayerCustom(player.sessionId, "hasThrown", false);
          ctx.state.setPlayerCustom(player.sessionId, "growthRayUsed", false);
        });
        ctx.broadcast("clearStones", {});
      }
    }

    broadcastEntities(ctx);
  },

  onPlayerAction(sessionId: string, action: string, data: unknown, ctx: RoomContext): void {
    if (action === "throwStone") {
      const hasThrown = ctx.state.getPlayerCustom<boolean>(sessionId, "hasThrown");
      if (hasThrown) return;

      const payload = data as { power: number };
      const power = payload.power;
      
      const x = ctx.state.getPlayerCustom<number>(sessionId, "x") || 640;
      const y = ctx.state.getPlayerCustom<number>(sessionId, "y") || 750;

      const eid = nextEid++;
      const stone: StoneEntity = {
        eid,
        x,
        y,
        dx: 0,
        dy: -power * 400,
        ownerId: sessionId,
        power: 0.2,
        growing: false,
      };

      stones.set(eid, stone);
      ctx.state.setPlayerCustom(sessionId, "hasThrown", true);
      broadcastEntities(ctx);
    } else if (action === "activateGrowthRay") {
      const growthRayUsed = ctx.state.getPlayerCustom<boolean>(sessionId, "growthRayUsed");
      if (growthRayUsed) return;

      // Find player's stone
      for (const stone of stones.values()) {
        if (stone.ownerId === sessionId) {
          stone.growing = true;
          ctx.state.setPlayerCustom(sessionId, "growthRayUsed", true);
          break;
        }
      }
    }
  },

  onPlayerJoin(sessionId: string, ctx: RoomContext): void {
    const players = ctx.state.getPlayers();
    const index = players.findIndex((p: { sessionId: string }) => p.sessionId === sessionId);
    const spacing = 1200 / (players.length + 1);
    const x = 40 + spacing * (index + 1);
    const y = 750;
    
    ctx.state.setPlayerCustom(sessionId, "x", x);
    ctx.state.setPlayerCustom(sessionId, "y", y);
    ctx.state.setPlayerCustom(sessionId, "hasThrown", false);
    ctx.state.setPlayerCustom(sessionId, "growthRayUsed", false);
    playerPositions.set(sessionId, { x, y });
  },

  checkWinCondition(ctx: RoomContext): string | null {
    if (ctx.state.phase !== "finished") return null;

    const players = ctx.state.getPlayers();
    let winner: string | null = null;
    let maxScore = -1;

    for (const player of players) {
      const score = ctx.state.getCustom<number>(`score_${player.sessionId}`) || 0;
      if (score > maxScore) {
        maxScore = score;
        winner = player.sessionId;
      }
    }

    return winner;
  },
};

export default roomLogic;