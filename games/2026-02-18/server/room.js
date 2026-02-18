// games/2026-02-18/server/room.ts
var nextEid = 1;
var stones = /* @__PURE__ */ new Map();
var playerPositions = /* @__PURE__ */ new Map();
function distance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}
function getClosestStone(ctx) {
  const targetX = 640;
  const targetY = 150;
  let closest = null;
  for (const stone of stones.values()) {
    const dist = distance(stone.x, stone.y, targetX, targetY);
    if (!closest || dist < closest.distance) {
      closest = { sessionId: stone.ownerId, distance: dist };
    }
  }
  return closest;
}
function broadcastEntities(ctx) {
  const entities = Array.from(stones.values()).map((stone) => ({
    eid: stone.eid,
    x: stone.x,
    y: stone.y,
    dx: stone.dx,
    dy: stone.dy,
    type: "stone",
    ownerId: stone.ownerId,
    power: stone.power,
    growing: stone.growing
  }));
  ctx.broadcast("entityUpdate", entities);
}
var roomLogic = {
  onInit(ctx) {
    ctx.state.setCustom("round", 1);
    ctx.state.setCustom("maxRounds", 3);
    ctx.state.setCustom("roundTimer", 45);
    ctx.state.setCustom("targetX", 640);
    ctx.state.setCustom("targetY", 150);
    const players = ctx.state.getPlayers();
    const spacing = 1200 / (players.length + 1);
    players.forEach((player, index) => {
      const x = 40 + spacing * (index + 1);
      const y = 750;
      ctx.state.setPlayerCustom(player.sessionId, "x", x);
      ctx.state.setPlayerCustom(player.sessionId, "y", y);
      ctx.state.setPlayerCustom(player.sessionId, "hasThrown", false);
      ctx.state.setPlayerCustom(player.sessionId, "growthRayUsed", false);
      playerPositions.set(player.sessionId, { x, y });
    });
  },
  onUpdate(dt, ctx) {
    const roundTimer = ctx.state.getCustom("roundTimer") || 45;
    const newTimer = Math.max(0, roundTimer - dt);
    ctx.state.setCustom("roundTimer", newTimer);
    for (const stone of stones.values()) {
      stone.x += stone.dx * dt;
      stone.y += stone.dy * dt;
      const friction = 0.98;
      stone.dx *= friction;
      stone.dy *= friction;
      if (Math.abs(stone.dx) < 1 && Math.abs(stone.dy) < 1) {
        stone.dx = 0;
        stone.dy = 0;
      }
      if (stone.x < 40 || stone.x > 1240) {
        stone.dx = 0;
        stone.x = Math.max(40, Math.min(1240, stone.x));
      }
      if (stone.y < 50 || stone.y > 750) {
        stone.dy = 0;
        stone.y = Math.max(50, Math.min(750, stone.y));
      }
      if (stone.growing) {
        stone.power = Math.min(1, stone.power + dt * 0.5);
      }
    }
    const players = ctx.state.getPlayers();
    const allThrown = players.every(
      (p) => ctx.state.getPlayerCustom(p.sessionId, "hasThrown") === true
    );
    if (newTimer <= 0 || allThrown) {
      const closest = getClosestStone(ctx);
      if (closest) {
        const winner = players.find((p) => p.sessionId === closest.sessionId);
        if (winner) {
          const currentScore = ctx.state.getCustom(`score_${winner.sessionId}`) || 0;
          ctx.state.setCustom(`score_${winner.sessionId}`, currentScore + 1);
        }
      }
      const round = ctx.state.getCustom("round") || 1;
      const maxRounds = ctx.state.getCustom("maxRounds") || 3;
      if (round >= maxRounds) {
        ctx.state.phase = "finished";
      } else {
        ctx.state.setCustom("round", round + 1);
        ctx.state.setCustom("roundTimer", 45);
        stones.clear();
        players.forEach((player) => {
          ctx.state.setPlayerCustom(player.sessionId, "hasThrown", false);
          ctx.state.setPlayerCustom(player.sessionId, "growthRayUsed", false);
        });
        ctx.broadcast("clearStones", {});
      }
    }
    broadcastEntities(ctx);
  },
  onPlayerAction(sessionId, action, data, ctx) {
    if (action === "throwStone") {
      const hasThrown = ctx.state.getPlayerCustom(sessionId, "hasThrown");
      if (hasThrown) return;
      const payload = data;
      const power = payload.power;
      const x = ctx.state.getPlayerCustom(sessionId, "x") || 640;
      const y = ctx.state.getPlayerCustom(sessionId, "y") || 750;
      const eid = nextEid++;
      const stone = {
        eid,
        x,
        y,
        dx: 0,
        dy: -power * 400,
        ownerId: sessionId,
        power: 0.2,
        growing: false
      };
      stones.set(eid, stone);
      ctx.state.setPlayerCustom(sessionId, "hasThrown", true);
      broadcastEntities(ctx);
    } else if (action === "activateGrowthRay") {
      const growthRayUsed = ctx.state.getPlayerCustom(sessionId, "growthRayUsed");
      if (growthRayUsed) return;
      for (const stone of stones.values()) {
        if (stone.ownerId === sessionId) {
          stone.growing = true;
          ctx.state.setPlayerCustom(sessionId, "growthRayUsed", true);
          break;
        }
      }
    }
  },
  onPlayerJoin(sessionId, ctx) {
    const players = ctx.state.getPlayers();
    const index = players.findIndex((p) => p.sessionId === sessionId);
    const spacing = 1200 / (players.length + 1);
    const x = 40 + spacing * (index + 1);
    const y = 750;
    ctx.state.setPlayerCustom(sessionId, "x", x);
    ctx.state.setPlayerCustom(sessionId, "y", y);
    ctx.state.setPlayerCustom(sessionId, "hasThrown", false);
    ctx.state.setPlayerCustom(sessionId, "growthRayUsed", false);
    playerPositions.set(sessionId, { x, y });
  },
  checkWinCondition(ctx) {
    if (ctx.state.phase !== "finished") return null;
    const players = ctx.state.getPlayers();
    let winner = null;
    let maxScore = -1;
    for (const player of players) {
      const score = ctx.state.getCustom(`score_${player.sessionId}`) || 0;
      if (score > maxScore) {
        maxScore = score;
        winner = player.sessionId;
      }
    }
    return winner;
  }
};
var room_default = roomLogic;
export {
  room_default as default
};
