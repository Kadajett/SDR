import type { GeneratedRoomLogic, RoomContext } from "@sdr/server";

interface StoneData {
  sessionId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  launched: boolean;
}

interface GrowthRayData {
  sessionId: string;
  cooldown: number;
}

interface GameData {
  stones: StoneData[];
  growthRays: GrowthRayData[];
  currentThrower: number;
  roundNumber: number;
  maxRounds: number;
  throwOrder: string[];
  roundActive: boolean;
  hasLaunched: boolean;
}

const roomLogic: GeneratedRoomLogic = {
  onInit(ctx: RoomContext): void {
    const players = ctx.state.getPlayers();
    const throwOrder = players.map((p) => p.sessionId);

    const gameData: GameData = {
      stones: [],
      growthRays: throwOrder.map((sessionId) => ({
        sessionId,
        cooldown: 0,
      })),
      currentThrower: 0,
      roundNumber: 1,
      maxRounds: 3,
      throwOrder,
      roundActive: false,
      hasLaunched: false,
    };

    ctx.state.setCustom("gameData", gameData);

    // Initialize player scores
    for (const player of players) {
      ctx.state.setPlayerCustom(player.sessionId, "score", 0);
    }

    ctx.state.timer = 0;
  },

  onUpdate(dt: number, ctx: RoomContext): void {
    ctx.state.timer += dt;

    const gameData = ctx.state.getCustomOr<GameData>("gameData", {
      stones: [],
      growthRays: [],
      currentThrower: 0,
      roundNumber: 1,
      maxRounds: 3,
      throwOrder: [],
      roundActive: false,
      hasLaunched: false,
    });

    // Update growth ray cooldowns
    for (const ray of gameData.growthRays) {
      if (ray.cooldown > 0) {
        ray.cooldown = Math.max(0, ray.cooldown - dt);
      }
    }

    // Update stone physics
    let anyMoving = false;
    const FRICTION = 0.98;
    const MIN_VELOCITY = 5;

    for (const stone of gameData.stones) {
      if (!stone.launched) continue;

      const speed = Math.sqrt(stone.vx * stone.vx + stone.vy * stone.vy);

      if (speed > MIN_VELOCITY) {
        anyMoving = true;

        // Apply friction
        stone.vx *= FRICTION;
        stone.vy *= FRICTION;

        // Update position
        stone.x += stone.vx * dt;
        stone.y += stone.vy * dt;

        // Boundary collision
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

    // Check if round is complete
    if (gameData.roundActive && !anyMoving && gameData.hasLaunched) {
      gameData.roundActive = false;
      gameData.hasLaunched = false;

      // Move to next player
      gameData.currentThrower++;
      if (gameData.currentThrower >= gameData.throwOrder.length) {
        endRound(ctx, gameData);
      }
    }

    ctx.state.setCustom("gameData", gameData);
    ctx.broadcast("gameState", gameData);
  },

  onPlayerAction(
    sessionId: string,
    action: string,
    data: unknown,
    ctx: RoomContext
  ): void {
    const gameData = ctx.state.getCustomOr<GameData>("gameData", {
      stones: [],
      growthRays: [],
      currentThrower: 0,
      roundNumber: 1,
      maxRounds: 3,
      throwOrder: [],
      roundActive: false,
      hasLaunched: false,
    });

    if (action === "launchStone") {
      const { power } = data as { power: number };
      const currentSessionId =
        gameData.throwOrder[gameData.currentThrower];

      if (
        sessionId === currentSessionId &&
        !gameData.hasLaunched &&
        !gameData.roundActive
      ) {
        const MAX_POWER = 800;
        const angle = -Math.PI / 2; // Up
        const speed = power * MAX_POWER;

        const stone: StoneData = {
          sessionId,
          x: 640,
          y: 700,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 20,
          launched: true,
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

        // Grow stones belonging to this player
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

  onPlayerJoin(sessionId: string, ctx: RoomContext): void {
    const gameData = ctx.state.getCustomOr<GameData>("gameData", {
      stones: [],
      growthRays: [],
      currentThrower: 0,
      roundNumber: 1,
      maxRounds: 3,
      throwOrder: [],
      roundActive: false,
      hasLaunched: false,
    });

    if (!gameData.throwOrder.includes(sessionId)) {
      gameData.throwOrder.push(sessionId);
      gameData.growthRays.push({
        sessionId,
        cooldown: 0,
      });
      ctx.state.setPlayerCustom(sessionId, "score", 0);
      ctx.state.setCustom("gameData", gameData);
    }
  },

  onPlayerLeave(sessionId: string, ctx: RoomContext): void {
    const gameData = ctx.state.getCustomOr<GameData>("gameData", {
      stones: [],
      growthRays: [],
      currentThrower: 0,
      roundNumber: 1,
      maxRounds: 3,
      throwOrder: [],
      roundActive: false,
      hasLaunched: false,
    });

    // Remove player from throw order
    const index = gameData.throwOrder.indexOf(sessionId);
    if (index !== -1) {
      gameData.throwOrder.splice(index, 1);
      if (gameData.currentThrower >= index && gameData.currentThrower > 0) {
        gameData.currentThrower--;
      }
    }

    // Remove their stones and growth ray
    gameData.stones = gameData.stones.filter(
      (s) => s.sessionId !== sessionId
    );
    gameData.growthRays = gameData.growthRays.filter(
      (r) => r.sessionId !== sessionId
    );

    ctx.state.setCustom("gameData", gameData);
  },

  checkWinCondition(ctx: RoomContext): string | null {
    const gameData = ctx.state.getCustomOr<GameData>("gameData", {
      stones: [],
      growthRays: [],
      currentThrower: 0,
      roundNumber: 1,
      maxRounds: 3,
      throwOrder: [],
      roundActive: false,
      hasLaunched: false,
    });

    if (gameData.roundNumber > gameData.maxRounds) {
      const players = ctx.state.getPlayers();
      let maxScore = -1;
      let winner: string | null = null;

      for (const player of players) {
        const score = ctx.state.getPlayerCustom<number>(
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
  },
};

function endRound(ctx: RoomContext, gameData: GameData): void {
  const TARGET_CENTER = { x: 640, y: 400 };
  const scores: Map<string, number> = new Map();

  for (const sessionId of gameData.throwOrder) {
    scores.set(sessionId, 0);
  }

  // Calculate scores based on distance to center
  for (const stone of gameData.stones) {
    const dx = stone.x - TARGET_CENTER.x;
    const dy = stone.y - TARGET_CENTER.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    let points = 0;
    if (distance < 50) {
      points = 3; // Center ring
    } else if (distance < 100) {
      points = 2; // Middle ring
    } else if (distance < 150) {
      points = 1; // Outer ring
    }

    scores.set(stone.sessionId, (scores.get(stone.sessionId) || 0) + points);
  }

  // Update player scores
  for (const [sessionId, roundScore] of scores) {
    const currentScore = ctx.state.getPlayerCustom<number>(sessionId, "score") || 0;
    ctx.state.setPlayerCustom(sessionId, "score", currentScore + roundScore);
  }

  // Clean up stones
  gameData.stones = [];
  gameData.currentThrower = 0;
  gameData.roundNumber++;
  gameData.hasLaunched = false;
  gameData.roundActive = false;

  ctx.broadcast("roundEnd", { scores: Array.from(scores.entries()) });
}

export default roomLogic;