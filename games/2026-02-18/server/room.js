// games/2026-02-18/server/room.ts
var WORLD_WIDTH = 1280;
var WORLD_HEIGHT = 800;
var TARGET_X = 640;
var TARGET_Y = 150;
var START_Y = 700;
var FRICTION = 0.95;
var STONE_BASE_SIZE = 30;
var MAX_STONE_SIZE = 100;
var THROW_SPEED = 300;
var GROWTH_RATE = 20;
var SHRINK_RATE = 15;
var GROWTH_RAY_RANGE = 150;
var GROWTH_RAY_DURATION = 2;
var THROWS_PER_PLAYER = 2;
var ROUND_TIME = 180;
function getDistance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
function getGameState(ctx) {
  const data = ctx.state.getCustom("gameState");
  if (!data) {
    const initial = {
      stones: [],
      growthRays: [],
      nextEid: 1,
      phase: "throwing",
      currentTurn: 0,
      roundTimer: ROUND_TIME,
      throwsRemaining: /* @__PURE__ */ new Map()
    };
    ctx.state.setCustom("gameState", initial);
    return initial;
  }
  return data;
}
function saveGameState(ctx, data) {
  ctx.state.setCustom("gameState", data);
}
function initializeThrows(ctx, gameState) {
  const players = ctx.state.getPlayers();
  gameState.throwsRemaining = /* @__PURE__ */ new Map();
  for (const player of players) {
    gameState.throwsRemaining.set(player.sessionId, THROWS_PER_PLAYER);
  }
}
function createStone(gameState, ownerId, x, y, dx, dy) {
  const stone = {
    eid: gameState.nextEid++,
    ownerId,
    x,
    y,
    dx,
    dy,
    size: STONE_BASE_SIZE
  };
  gameState.stones.push(stone);
  return stone;
}
function createGrowthRay(gameState, ownerId) {
  const ray = {
    eid: gameState.nextEid++,
    ownerId,
    active: true,
    duration: GROWTH_RAY_DURATION
  };
  gameState.growthRays.push(ray);
  return ray;
}
function updateStonePhysics(stone, dt) {
  stone.x += stone.dx * dt;
  stone.y += stone.dy * dt;
  stone.dx *= Math.pow(FRICTION, dt * 60);
  stone.dy *= Math.pow(FRICTION, dt * 60);
  if (Math.abs(stone.dx) < 1 && Math.abs(stone.dy) < 1) {
    stone.dx = 0;
    stone.dy = 0;
  }
  if (stone.x < stone.size) stone.x = stone.size;
  if (stone.x > WORLD_WIDTH - stone.size) stone.x = WORLD_WIDTH - stone.size;
  if (stone.y < stone.size) stone.y = stone.size;
  if (stone.y > WORLD_HEIGHT - stone.size) stone.y = WORLD_HEIGHT - stone.size;
}
function handleStoneCollisions(stones) {
  for (let i = 0; i < stones.length; i++) {
    for (let j = i + 1; j < stones.length; j++) {
      const a = stones[i];
      const b = stones[j];
      const dist = getDistance(a.x, a.y, b.x, b.y);
      const minDist = a.size + b.size;
      if (dist < minDist && dist > 0) {
        const overlap = minDist - dist;
        const dx = (b.x - a.x) / dist;
        const dy = (b.y - a.y) / dist;
        a.x -= dx * overlap * 0.5;
        a.y -= dy * overlap * 0.5;
        b.x += dx * overlap * 0.5;
        b.y += dy * overlap * 0.5;
        const dvx = b.dx - a.dx;
        const dvy = b.dy - a.dy;
        const dvdot = dvx * dx + dvy * dy;
        if (dvdot < 0) {
          const massA = a.size * a.size;
          const massB = b.size * b.size;
          const totalMass = massA + massB;
          const impulse = 2 * dvdot / totalMass;
          a.dx += impulse * massB * dx;
          a.dy += impulse * massB * dy;
          b.dx -= impulse * massA * dx;
          b.dy -= impulse * massA * dy;
        }
      }
    }
  }
}
function applyGrowthRay(ray, stones, dt, ctx) {
  const player = ctx.state.getPlayers().find((p) => p.sessionId === ray.ownerId);
  if (!player) return;
  const px = ctx.state.getPlayerCustom(ray.ownerId, "x") || TARGET_X;
  const py = ctx.state.getPlayerCustom(ray.ownerId, "y") || START_Y;
  for (const stone of stones) {
    const dist = getDistance(stone.x, stone.y, px, py);
    if (dist < GROWTH_RAY_RANGE) {
      if (stone.ownerId === ray.ownerId) {
        stone.size = Math.min(stone.size + GROWTH_RATE * dt, MAX_STONE_SIZE);
      } else {
        stone.size = Math.max(stone.size - SHRINK_RATE * dt, STONE_BASE_SIZE * 0.5);
      }
    }
  }
}
function calculateScores(ctx, gameState) {
  const players = ctx.state.getPlayers();
  for (const player of players) {
    let bestDist = Infinity;
    for (const stone of gameState.stones) {
      if (stone.ownerId === player.sessionId) {
        const dist = getDistance(stone.x, stone.y, TARGET_X, TARGET_Y);
        if (dist < bestDist) {
          bestDist = dist;
        }
      }
    }
    let score = 0;
    if (bestDist < 40) score = 100;
    else if (bestDist < 60) score = 50;
    else if (bestDist < 80) score = 25;
    ctx.state.setPlayerCustom(player.sessionId, "score", score);
  }
}
function findWinner(ctx) {
  const players = ctx.state.getPlayers();
  let maxScore = -1;
  let winnerId = null;
  for (const player of players) {
    const score = ctx.state.getPlayerCustom(player.sessionId, "score") || 0;
    if (score > maxScore) {
      maxScore = score;
      winnerId = player.sessionId;
    }
  }
  return winnerId;
}
var roomLogic = {
  onInit(ctx) {
    ctx.state.setCustom("phase", "throwing");
    const gameState = getGameState(ctx);
    initializeThrows(ctx, gameState);
    saveGameState(ctx, gameState);
    const players = ctx.state.getPlayers();
    for (const player of players) {
      ctx.state.setPlayerCustom(player.sessionId, "x", TARGET_X);
      ctx.state.setPlayerCustom(player.sessionId, "y", START_Y);
      ctx.state.setPlayerCustom(player.sessionId, "score", 0);
    }
  },
  onUpdate(dt, ctx) {
    const gameState = getGameState(ctx);
    gameState.roundTimer -= dt;
    if (gameState.roundTimer <= 0) {
      gameState.phase = "finished";
      calculateScores(ctx, gameState);
      const winnerId = findWinner(ctx);
      ctx.state.setCustom("winnerId", winnerId);
    }
    ctx.state.setCustom("timer", Math.max(0, Math.floor(gameState.roundTimer)));
    ctx.state.setCustom("phase", gameState.phase);
    for (const stone of gameState.stones) {
      updateStonePhysics(stone, dt);
    }
    handleStoneCollisions(gameState.stones);
    for (let i = gameState.growthRays.length - 1; i >= 0; i--) {
      const ray = gameState.growthRays[i];
      ray.duration -= dt;
      if (ray.duration <= 0) {
        ctx.broadcast("remove-entity", { eid: ray.eid });
        gameState.growthRays.splice(i, 1);
      } else {
        applyGrowthRay(ray, gameState.stones, dt, ctx);
        ctx.broadcast("growth-ray-update", ray);
      }
    }
    for (const stone of gameState.stones) {
      ctx.broadcast("stone-update", stone);
    }
    saveGameState(ctx, gameState);
  },
  onPlayerAction(sessionId, action, data, ctx) {
    const gameState = getGameState(ctx);
    if (action === "throw" && gameState.phase === "throwing") {
      const throwsLeft = gameState.throwsRemaining.get(sessionId) || 0;
      if (throwsLeft > 0) {
        const throwData = data;
        const power = Math.min(throwData.power, 1);
        const dx = Math.cos(throwData.angle) * THROW_SPEED * power;
        const dy = Math.sin(throwData.angle) * THROW_SPEED * power;
        const px = ctx.state.getPlayerCustom(sessionId, "x") || TARGET_X;
        const py = ctx.state.getPlayerCustom(sessionId, "y") || START_Y;
        const stone = createStone(gameState, sessionId, px, py, dx, dy);
        ctx.broadcast("stone-update", stone);
        gameState.throwsRemaining.set(sessionId, throwsLeft - 1);
      }
    } else if (action === "activate-ray" && gameState.phase === "throwing") {
      const existingRay = gameState.growthRays.find((r) => r.ownerId === sessionId);
      if (!existingRay) {
        const ray = createGrowthRay(gameState, sessionId);
        ctx.broadcast("growth-ray-update", ray);
      }
    }
    saveGameState(ctx, gameState);
  },
  onPlayerJoin(sessionId, ctx) {
    ctx.state.setPlayerCustom(sessionId, "x", TARGET_X);
    ctx.state.setPlayerCustom(sessionId, "y", START_Y);
    ctx.state.setPlayerCustom(sessionId, "score", 0);
    const gameState = getGameState(ctx);
    gameState.throwsRemaining.set(sessionId, THROWS_PER_PLAYER);
    saveGameState(ctx, gameState);
  },
  checkWinCondition(ctx) {
    const phase = ctx.state.getCustom("phase");
    if (phase === "finished") {
      return ctx.state.getCustom("winnerId") || null;
    }
    return null;
  }
};
var room_default = roomLogic;
export {
  room_default as default
};
