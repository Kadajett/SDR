import type { GeneratedRoomLogic, RoomContext } from "@sdr/server";

interface StoneEntity {
  id: number;
  type: "stone";
  x: number;
  y: number;
  dx: number;
  dy: number;
  ownerId: string;
  size: number;
  power: number;
}

interface RayEntity {
  id: number;
  type: "ray";
  x: number;
  y: number;
  ownerId: string;
  active: boolean;
}

type Entity = StoneEntity | RayEntity;

let nextEntityId = 1;
let roundTimer = 0;
const ROUND_DURATION = 120;

function createStone(
  x: number,
  y: number,
  dx: number,
  dy: number,
  ownerId: string,
  power: number
): StoneEntity {
  return {
    id: nextEntityId++,
    type: "stone",
    x,
    y,
    dx,
    dy,
    ownerId,
    size: 1,
    power,
  };
}

function createRay(x: number, y: number, ownerId: string): RayEntity {
  return {
    id: nextEntityId++,
    type: "ray",
    x,
    y,
    ownerId,
    active: true,
  };
}

function getEntities(ctx: RoomContext): Entity[] {
  return ctx.state.getCustomOr<Entity[]>("entities", []);
}

function setEntities(ctx: RoomContext, entities: Entity[]): void {
  ctx.state.setCustom("entities", entities);
}

function calculateScore(stone: StoneEntity): number {
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

function checkCollision(a: StoneEntity, b: StoneEntity): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const minDist = (a.size + b.size) * 16;
  return distance < minDist;
}

function resolveCollision(a: StoneEntity, b: StoneEntity): void {
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

  const impulseA = (2 * massB * impulse) / totalMass;
  const impulseB = (2 * massA * impulse) / totalMass;

  a.dx -= impulseA * nx * 0.8;
  a.dy -= impulseA * ny * 0.8;
  b.dx += impulseB * nx * 0.8;
  b.dy += impulseB * ny * 0.8;
}

const roomLogic: GeneratedRoomLogic = {
  onInit(ctx: RoomContext): void {
    ctx.state.setCustom("entities", []);
    ctx.state.setCustom("roundTimer", ROUND_DURATION);
    roundTimer = ROUND_DURATION;

    for (const player of ctx.state.getPlayers()) {
      ctx.state.setPlayerCustom(player.sessionId, "canShoot", true);
      ctx.state.setPlayerCustom(player.sessionId, "chargePower", 0);
    }
  },

  onUpdate(dt: number, ctx: RoomContext): void {
    const entities = getEntities(ctx);
    const stones = entities.filter((e: Entity) => e.type === "stone") as StoneEntity[];
    const rays = entities.filter((e: Entity) => e.type === "ray") as RayEntity[];

    // Update round timer
    roundTimer -= dt;
    ctx.state.setCustom("roundTimer", Math.max(0, roundTimer));

    // Update stones
    for (const stone of stones) {
      stone.x += stone.dx * dt;
      stone.y += stone.dy * dt;

      // Friction
      stone.dx *= 0.98;
      stone.dy *= 0.98;

      // Stop if too slow
      if (Math.abs(stone.dx) < 0.1 && Math.abs(stone.dy) < 0.1) {
        stone.dx = 0;
        stone.dy = 0;
      }

      // Bounds
      if (stone.x < 100 || stone.x > 1180) {
        stone.dx *= -0.5;
        stone.x = Math.max(100, Math.min(1180, stone.x));
      }
      if (stone.y < 100 || stone.y > 700) {
        stone.dy *= -0.5;
        stone.y = Math.max(100, Math.min(700, stone.y));
      }
    }

    // Check collisions
    for (let i = 0; i < stones.length; i++) {
      for (let j = i + 1; j < stones.length; j++) {
        if (checkCollision(stones[i], stones[j])) {
          resolveCollision(stones[i], stones[j]);
          ctx.broadcast("stoneCollision", {
            a: stones[i].id,
            b: stones[j].id,
          });
        }
      }
    }

    // Update growth rays
    for (const ray of rays) {
      if (ray.active) {
        // Find stones owned by this player and grow them
        const playerStones = stones.filter(
          (s: StoneEntity) => s.ownerId === ray.ownerId
        );
        for (const stone of playerStones) {
          stone.size = Math.min(2.5, stone.size + dt * 0.5);
        }
      }
    }

    // Remove inactive rays after 2 seconds
    const activeRays = rays.filter((r: RayEntity) => {
      if (!r.active) {
        const timeSinceInactive = ctx.elapsedTime;
        return timeSinceInactive < 2;
      }
      return true;
    });

    // Calculate scores when all stones are stopped
    const allStopped = stones.every(
      (s: StoneEntity) => s.dx === 0 && s.dy === 0
    );
    if (allStopped && stones.length > 0) {
      for (const player of ctx.state.getPlayers()) {
        const playerStones = stones.filter(
          (s: StoneEntity) => s.ownerId === player.sessionId
        );
        let totalScore = 0;
        for (const stone of playerStones) {
          totalScore += calculateScore(stone);
        }
        ctx.state.setPlayerCustom(player.sessionId, "score", totalScore);
      }
    }

    // Update entity list
    setEntities(ctx, [...stones, ...activeRays]);
    ctx.broadcast("stateUpdate", { entities: getEntities(ctx) });
  },

  onPlayerInput(
    sessionId: string,
    input: { x: number; y: number; buttons: Record<string, boolean> },
    ctx: RoomContext
  ): void {
    const canShoot = ctx.state.getPlayerCustom<boolean>(sessionId, "canShoot");
    if (!canShoot) return;

    // Store aim direction
    ctx.state.setPlayerCustom(sessionId, "aimX", input.x);
    ctx.state.setPlayerCustom(sessionId, "aimY", input.y);
  },

  onPlayerAction(
    sessionId: string,
    action: string,
    data: unknown,
    ctx: RoomContext
  ): void {
    if (action === "charge") {
      const { power } = data as { power: number };
      ctx.state.setPlayerCustom(sessionId, "chargePower", power);
    } else if (action === "shoot") {
      const canShoot = ctx.state.getPlayerCustom<boolean>(
        sessionId,
        "canShoot"
      );
      if (!canShoot) return;

      const { dx, dy } = data as { dx: number; dy: number };
      const power = ctx.state.getPlayerCustom<number>(
        sessionId,
        "chargePower"
      ) || 0.5;

      const playerIndex = ctx.state
        .getPlayers()
        .findIndex((p) => p.sessionId === sessionId);
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

      // Allow shooting again after 5 seconds
      setTimeout(() => {
        ctx.state.setPlayerCustom(sessionId, "canShoot", true);
      }, 5000);
    } else if (action === "fireRay") {
      const entities = getEntities(ctx);
      const playerStones = entities.filter(
        (e: Entity) =>
          e.type === "stone" &&
          (e as StoneEntity).ownerId === sessionId
      ) as StoneEntity[];

      if (playerStones.length > 0) {
        const targetStone = playerStones[0];
        const ray = createRay(targetStone.x, targetStone.y, sessionId);
        entities.push(ray);
        setEntities(ctx, entities);

        // Deactivate ray after 2 seconds
        setTimeout(() => {
          const currentEntities = getEntities(ctx);
          const rayIndex = currentEntities.findIndex(
            (e: Entity) => e.type === "ray" && e.id === ray.id
          );
          if (rayIndex !== -1) {
            const foundRay = currentEntities[rayIndex] as RayEntity;
            foundRay.active = false;
          }
          setEntities(ctx, currentEntities);
        }, 2000);
      }
    }
  },

  onPlayerJoin(sessionId: string, ctx: RoomContext): void {
    ctx.state.setPlayerCustom(sessionId, "score", 0);
    ctx.state.setPlayerCustom(sessionId, "canShoot", true);
    ctx.state.setPlayerCustom(sessionId, "chargePower", 0);
    ctx.state.setPlayerCustom(sessionId, "aimX", 0);
    ctx.state.setPlayerCustom(sessionId, "aimY", -1);
  },

  onPlayerLeave(sessionId: string, ctx: RoomContext): void {
    const entities = getEntities(ctx);
    const filteredEntities = entities.filter((e: Entity) => {
      if (e.type === "stone") {
        return (e as StoneEntity).ownerId !== sessionId;
      }
      if (e.type === "ray") {
        return (e as RayEntity).ownerId !== sessionId;
      }
      return true;
    });
    setEntities(ctx, filteredEntities);
  },

  checkWinCondition(ctx: RoomContext): string | null {
    const players = ctx.state.getPlayers();
    const scores = players.map((p) => ({
      sessionId: p.sessionId,
      score: ctx.state.getPlayerCustom<number>(p.sessionId, "score") || 0,
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
  },
};

export default roomLogic;