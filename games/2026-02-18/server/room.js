// games/2026-02-18/server/room.ts
var roomLogic = {
  onInit(ctx) {
    const players = ctx.state.getPlayers();
    const throwOrder = players.map((p) => p.sessionId);
    const gameData = {
      stones: [],
      growthRays: throwOrder.map((sessionId) => ({
        sessionId,
        cooldown: 0
      })),
      currentThrower: 0,
      roundNumber: 1,
      maxRounds: 3,
      throwOrder,
      roundActive: false,
      hasLaunched: false
    };
    ctx.state.setCustom("gameData", gameData);
    for (const player of players) {
      ctx.state.setPlayerCustom(player.sessionId, "score", 0);
    }
    ctx.state.timer = 0;
  },
  onUpdate(dt, ctx) {
    ctx.state.timer += dt;
    const gameData = ctx.state.getCustomOr("gameData", {
      stones: [],
      growthRays: [],
      currentThrower: 0,
      roundNumber: 1,
      maxRounds: 3,
      throwOrder: [],
      roundActive: false,
      hasLaunched: false
    });
    for (const ray of gameData.growthRays) {
      if (ray.cooldown > 0) {
        ray.cooldown = Math.max(0, ray.cooldown - dt);
      }
    }
    let anyMoving = false;
    const FRICTION = 0.98;
    const MIN_VELOCITY = 5;
    for (const stone of gameData.stones) {
      if (!stone.launched) continue;
      const speed = Math.sqrt(stone.vx * stone.vx + stone.vy * stone.vy);
      if (speed > MIN_VELOCITY) {
        anyMoving = true;
        stone.vx *= FRICTION;
        stone.vy *= FRICTION;
        stone.x += stone.vx * dt;
        stone.y += stone.vy * dt;
        if (stone.x - stone.radius < 240 || stone.x + stone.radius > 1040) {
          stone.vx *= -0.8;
          stone.x = Math.max(
            240 + stone.radius,
            Math.min(1040 - stone.radius, stone.x)
          );
        }
        if (stone.y - stone.radius < 50 || stone.y + stone.radius > 750) {
          stone.vy *= -0.8;
          stone.y = Math.max(
            50 + stone.radius,
            Math.min(750 - stone.radius, stone.y)
          );
        }
      } else {
        stone.vx = 0;
        stone.vy = 0;
      }
    }
    if (gameData.roundActive && !anyMoving && gameData.hasLaunched) {
      gameData.roundActive = false;
      gameData.hasLaunched = false;
      gameData.currentThrower++;
      if (gameData.currentThrower >= gameData.throwOrder.length) {
        endRound(ctx, gameData);
      }
    }
    ctx.state.setCustom("gameData", gameData);
    ctx.broadcast("gameState", gameData);
  },
  onPlayerAction(sessionId, action, data, ctx) {
    const gameData = ctx.state.getCustomOr("gameData", {
      stones: [],
      growthRays: [],
      currentThrower: 0,
      roundNumber: 1,
      maxRounds: 3,
      throwOrder: [],
      roundActive: false,
      hasLaunched: false
    });
    if (action === "launchStone") {
      const { power } = data;
      const currentSessionId = gameData.throwOrder[gameData.currentThrower];
      if (sessionId === currentSessionId && !gameData.hasLaunched && !gameData.roundActive) {
        const MAX_POWER = 800;
        const angle = -Math.PI / 2;
        const speed = power * MAX_POWER;
        const stone = {
          sessionId,
          x: 640,
          y: 700,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 20,
          launched: true
        };
        gameData.stones.push(stone);
        gameData.hasLaunched = true;
        gameData.roundActive = true;
        ctx.state.setCustom("gameData", gameData);
        ctx.broadcast("stoneLaunch", stone);
      }
    } else if (action === "growthRay") {
      const ray = gameData.growthRays.find((r) => r.sessionId === sessionId);
      if (ray && ray.cooldown <= 0 && gameData.roundActive) {
        const GROWTH_MULTIPLIER = 1.5;
        const GROWTH_RAY_COOLDOWN = 3;
        for (const stone of gameData.stones) {
          if (stone.sessionId === sessionId) {
            stone.radius *= GROWTH_MULTIPLIER;
          }
        }
        ray.cooldown = GROWTH_RAY_COOLDOWN;
        ctx.state.setCustom("gameData", gameData);
        ctx.broadcast("growthRay", { sessionId });
      }
    }
  },
  onPlayerJoin(sessionId, ctx) {
    const gameData = ctx.state.getCustomOr("gameData", {
      stones: [],
      growthRays: [],
      currentThrower: 0,
      roundNumber: 1,
      maxRounds: 3,
      throwOrder: [],
      roundActive: false,
      hasLaunched: false
    });
    if (!gameData.throwOrder.includes(sessionId)) {
      gameData.throwOrder.push(sessionId);
      gameData.growthRays.push({
        sessionId,
        cooldown: 0
      });
      ctx.state.setPlayerCustom(sessionId, "score", 0);
      ctx.state.setCustom("gameData", gameData);
    }
  },
  onPlayerLeave(sessionId, ctx) {
    const gameData = ctx.state.getCustomOr("gameData", {
      stones: [],
      growthRays: [],
      currentThrower: 0,
      roundNumber: 1,
      maxRounds: 3,
      throwOrder: [],
      roundActive: false,
      hasLaunched: false
    });
    const index = gameData.throwOrder.indexOf(sessionId);
    if (index !== -1) {
      gameData.throwOrder.splice(index, 1);
      if (gameData.currentThrower >= index && gameData.currentThrower > 0) {
        gameData.currentThrower--;
      }
    }
    gameData.stones = gameData.stones.filter(
      (s) => s.sessionId !== sessionId
    );
    gameData.growthRays = gameData.growthRays.filter(
      (r) => r.sessionId !== sessionId
    );
    ctx.state.setCustom("gameData", gameData);
  },
  checkWinCondition(ctx) {
    const gameData = ctx.state.getCustomOr("gameData", {
      stones: [],
      growthRays: [],
      currentThrower: 0,
      roundNumber: 1,
      maxRounds: 3,
      throwOrder: [],
      roundActive: false,
      hasLaunched: false
    });
    if (gameData.roundNumber > gameData.maxRounds) {
      const players = ctx.state.getPlayers();
      let maxScore = -1;
      let winner = null;
      for (const player of players) {
        const score = ctx.state.getPlayerCustom(
          player.sessionId,
          "score"
        ) || 0;
        if (score > maxScore) {
          maxScore = score;
          winner = player.sessionId;
        }
      }
      return winner;
    }
    return null;
  }
};
function endRound(ctx, gameData) {
  const TARGET_CENTER = { x: 640, y: 400 };
  const scores = /* @__PURE__ */ new Map();
  for (const sessionId of gameData.throwOrder) {
    scores.set(sessionId, 0);
  }
  for (const stone of gameData.stones) {
    const dx = stone.x - TARGET_CENTER.x;
    const dy = stone.y - TARGET_CENTER.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    let points = 0;
    if (distance < 50) {
      points = 3;
    } else if (distance < 100) {
      points = 2;
    } else if (distance < 150) {
      points = 1;
    }
    scores.set(stone.sessionId, (scores.get(stone.sessionId) || 0) + points);
  }
  for (const [sessionId, roundScore] of scores) {
    const currentScore = ctx.state.getPlayerCustom(sessionId, "score") || 0;
    ctx.state.setPlayerCustom(sessionId, "score", currentScore + roundScore);
  }
  gameData.stones = [];
  gameData.currentThrower = 0;
  gameData.roundNumber++;
  gameData.hasLaunched = false;
  gameData.roundActive = false;
  ctx.broadcast("roundEnd", { scores: Array.from(scores.entries()) });
}
var room_default = roomLogic;
export {
  room_default as default
};
