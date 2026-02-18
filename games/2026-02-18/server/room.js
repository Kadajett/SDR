// games/2026-02-18/server/room.ts
var nextEntityId = 1;
var roundTimer = 0;
var ROUND_DURATION = 120;
function createStone(x, y, dx, dy, ownerId, power) {
  return {
    id: nextEntityId++,
    type: "stone",
    x,
    y,
    dx,
    dy,
    ownerId,
    size: 1,
    power
  };
}
function createRay(x, y, ownerId) {
  return {
    id: nextEntityId++,
    type: "ray",
    x,
    y,
    ownerId,
    active: true
  };
}
function getEntities(ctx) {
  return ctx.state.getCustomOr("entities", []);
}
function setEntities(ctx, entities) {
  ctx.state.setCustom("entities", entities);
}
function calculateScore(stone) {
  const centerX = 640;
  const centerY = 200;
  const distance = Math.sqrt(
    Math.pow(stone.x - centerX, 2) + Math.pow(stone.y - centerY, 2)
  );
  if (distance < 30) return 20;
  if (distance < 60) return 10;
  if (distance < 100) return 5;
  return 0;
}
function checkCollision(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const minDist = (a.size + b.size) * 16;
  return distance < minDist;
}
function resolveCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance === 0) return;
  const nx = dx / distance;
  const ny = dy / distance;
  const relativeVelX = a.dx - b.dx;
  const relativeVelY = a.dy - b.dy;
  const impulse = relativeVelX * nx + relativeVelY * ny;
  if (impulse < 0) return;
  const massA = a.size * a.size;
  const massB = b.size * b.size;
  const totalMass = massA + massB;
  const impulseA = 2 * massB * impulse / totalMass;
  const impulseB = 2 * massA * impulse / totalMass;
  a.dx -= impulseA * nx * 0.8;
  a.dy -= impulseA * ny * 0.8;
  b.dx += impulseB * nx * 0.8;
  b.dy += impulseB * ny * 0.8;
}
var roomLogic = {
  onInit(ctx) {
    ctx.state.setCustom("entities", []);
    ctx.state.setCustom("roundTimer", ROUND_DURATION);
    roundTimer = ROUND_DURATION;
    for (const player of ctx.state.getPlayers()) {
      ctx.state.setPlayerCustom(player.sessionId, "canShoot", true);
      ctx.state.setPlayerCustom(player.sessionId, "chargePower", 0);
    }
  },
  onUpdate(dt, ctx) {
    const entities = getEntities(ctx);
    const stones = entities.filter((e) => e.type === "stone");
    const rays = entities.filter((e) => e.type === "ray");
    roundTimer -= dt;
    ctx.state.setCustom("roundTimer", Math.max(0, roundTimer));
    for (const stone of stones) {
      stone.x += stone.dx * dt;
      stone.y += stone.dy * dt;
      stone.dx *= 0.98;
      stone.dy *= 0.98;
      if (Math.abs(stone.dx) < 0.1 && Math.abs(stone.dy) < 0.1) {
        stone.dx = 0;
        stone.dy = 0;
      }
      if (stone.x < 100 || stone.x > 1180) {
        stone.dx *= -0.5;
        stone.x = Math.max(100, Math.min(1180, stone.x));
      }
      if (stone.y < 100 || stone.y > 700) {
        stone.dy *= -0.5;
        stone.y = Math.max(100, Math.min(700, stone.y));
      }
    }
    for (let i = 0; i < stones.length; i++) {
      for (let j = i + 1; j < stones.length; j++) {
        if (checkCollision(stones[i], stones[j])) {
          resolveCollision(stones[i], stones[j]);
          ctx.broadcast("stoneCollision", {
            a: stones[i].id,
            b: stones[j].id
          });
        }
      }
    }
    for (const ray of rays) {
      if (ray.active) {
        const playerStones = stones.filter(
          (s) => s.ownerId === ray.ownerId
        );
        for (const stone of playerStones) {
          stone.size = Math.min(2.5, stone.size + dt * 0.5);
        }
      }
    }
    const activeRays = rays.filter((r) => {
      if (!r.active) {
        const timeSinceInactive = ctx.elapsedTime;
        return timeSinceInactive < 2;
      }
      return true;
    });
    const allStopped = stones.every(
      (s) => s.dx === 0 && s.dy === 0
    );
    if (allStopped && stones.length > 0) {
      for (const player of ctx.state.getPlayers()) {
        const playerStones = stones.filter(
          (s) => s.ownerId === player.sessionId
        );
        let totalScore = 0;
        for (const stone of playerStones) {
          totalScore += calculateScore(stone);
        }
        ctx.state.setPlayerCustom(player.sessionId, "score", totalScore);
      }
    }
    setEntities(ctx, [...stones, ...activeRays]);
    ctx.broadcast("stateUpdate", { entities: getEntities(ctx) });
  },
  onPlayerInput(sessionId, input, ctx) {
    const canShoot = ctx.state.getPlayerCustom(sessionId, "canShoot");
    if (!canShoot) return;
    ctx.state.setPlayerCustom(sessionId, "aimX", input.x);
    ctx.state.setPlayerCustom(sessionId, "aimY", input.y);
  },
  onPlayerAction(sessionId, action, data, ctx) {
    if (action === "charge") {
      const { power } = data;
      ctx.state.setPlayerCustom(sessionId, "chargePower", power);
    } else if (action === "shoot") {
      const canShoot = ctx.state.getPlayerCustom(
        sessionId,
        "canShoot"
      );
      if (!canShoot) return;
      const { dx, dy } = data;
      const power = ctx.state.getPlayerCustom(
        sessionId,
        "chargePower"
      ) || 0.5;
      const playerIndex = ctx.state.getPlayers().findIndex((p) => p.sessionId === sessionId);
      const startX = 640 + (playerIndex - 1) * 100;
      const startY = 700;
      const speed = 300 + power * 200;
      const magnitude = Math.sqrt(dx * dx + dy * dy);
      const normalizedDx = magnitude > 0 ? dx / magnitude : 0;
      const normalizedDy = magnitude > 0 ? dy / magnitude : -1;
      const stone = createStone(
        startX,
        startY,
        normalizedDx * speed,
        normalizedDy * speed,
        sessionId,
        power
      );
      const entities = getEntities(ctx);
      entities.push(stone);
      setEntities(ctx, entities);
      ctx.state.setPlayerCustom(sessionId, "canShoot", false);
      ctx.state.setPlayerCustom(sessionId, "chargePower", 0);
      setTimeout(() => {
        ctx.state.setPlayerCustom(sessionId, "canShoot", true);
      }, 5e3);
    } else if (action === "fireRay") {
      const entities = getEntities(ctx);
      const playerStones = entities.filter(
        (e) => e.type === "stone" && e.ownerId === sessionId
      );
      if (playerStones.length > 0) {
        const targetStone = playerStones[0];
        const ray = createRay(targetStone.x, targetStone.y, sessionId);
        entities.push(ray);
        setEntities(ctx, entities);
        setTimeout(() => {
          const currentEntities = getEntities(ctx);
          const rayIndex = currentEntities.findIndex(
            (e) => e.type === "ray" && e.id === ray.id
          );
          if (rayIndex !== -1) {
            const foundRay = currentEntities[rayIndex];
            foundRay.active = false;
          }
          setEntities(ctx, currentEntities);
        }, 2e3);
      }
    }
  },
  onPlayerJoin(sessionId, ctx) {
    ctx.state.setPlayerCustom(sessionId, "score", 0);
    ctx.state.setPlayerCustom(sessionId, "canShoot", true);
    ctx.state.setPlayerCustom(sessionId, "chargePower", 0);
    ctx.state.setPlayerCustom(sessionId, "aimX", 0);
    ctx.state.setPlayerCustom(sessionId, "aimY", -1);
  },
  onPlayerLeave(sessionId, ctx) {
    const entities = getEntities(ctx);
    const filteredEntities = entities.filter((e) => {
      if (e.type === "stone") {
        return e.ownerId !== sessionId;
      }
      if (e.type === "ray") {
        return e.ownerId !== sessionId;
      }
      return true;
    });
    setEntities(ctx, filteredEntities);
  },
  checkWinCondition(ctx) {
    const players = ctx.state.getPlayers();
    const scores = players.map((p) => ({
      sessionId: p.sessionId,
      score: ctx.state.getPlayerCustom(p.sessionId, "score") || 0
    }));
    const maxScore = Math.max(...scores.map((s) => s.score));
    if (maxScore >= 50) {
      const winner = scores.find((s) => s.score === maxScore);
      return winner ? winner.sessionId : null;
    }
    if (roundTimer <= 0) {
      const winner = scores.find((s) => s.score === maxScore);
      return winner ? winner.sessionId : null;
    }
    return null;
  }
};
var room_default = roomLogic;
export {
  room_default as default
};
