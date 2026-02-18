/**
 * EXAMPLE GAME: Grassland Gem Rush
 *
 * REFERENCE IMPLEMENTATION — demonstrates correct usage of:
 *   - bitECS 0.4 (SoA components, inline query(), observe/onAdd/onRemove)
 *   - Phaser 3 (scene lifecycle, GameObjects, tweens, cameras)
 *   - InputManager (new InputState API: moveX/moveY, action1-4, lastDevice)
 *   - BaseScene (onUpdate, checkWinCondition, player tracking)
 *   - HUD (score, timer, player list)
 *   - Win screen overlay + auto-restart
 *
 * Generated games may be any genre, theme, or style — this is NOT a template.
 * It demonstrates patterns. Gameplay will vary wildly per generation.
 *
 * Gameplay: 2–5 players collect gold gems. First to WIN_SCORE wins.
 * Gems respawn instantly. Timer counts down; highest score wins on expiry.
 */

import Phaser from "phaser";
import {
  createWorld,
  addEntity,
  addComponent,
  removeEntity,
  query,
  observe,
  onAdd,
  onRemove,
} from "bitecs";
import type { PlayerState, EntityDef } from "@sdr/shared";
import { BaseScene, InputManager, HUD } from "@sdr/engine";
import type { InputState } from "@sdr/engine";

// ============================================================
// CONSTANTS
// ============================================================

const TILE_SIZE = 32;
const MAP_COLS = 40; // 1280 / 32
const MAP_ROWS = 25; // 800  / 32
const PLAYER_SPEED = 220; // px/s
const WIN_SCORE = 10;
const GAME_DURATION = 120; // seconds
const GEM_COUNT = 8;
const COLLECT_RADIUS = 24;
const DEADZONE = 0.15;

// ============================================================
// 1. COMPONENTS — bitECS 0.4 SoA format
// ============================================================

const Position = { x: [] as number[], y: [] as number[] };
const Velocity = { dx: [] as number[], dy: [] as number[] };
const Visual = {
  color: [] as number[],
  width: [] as number[],
  height: [] as number[],
};
const PlayerControlled = { sessionId: [] as string[] };
const Collectible = { points: [] as number[] };
const Solid = {};
const TileTag = {};

// ============================================================
// 2. PHASER GAME-OBJECT REGISTRY
//
// bitECS components hold only plain numbers/strings.
// Phaser GameObjects live in a separate Map keyed by entity id.
// ============================================================

const gameObjects = new Map<number, Phaser.GameObjects.Rectangle>();

// ============================================================
// 3. SYSTEMS
// ============================================================

/**
 * Translates InputState axes → Velocity for the local player.
 * Applies deadzone and normalises diagonal so diagonal ≠ faster.
 */
function inputSystem(
  _world: ReturnType<typeof createWorld>,
  input: InputState,
  localPlayerEid: number,
): void {
  if (localPlayerEid < 0) return;

  let dx = Math.abs(input.moveX) > DEADZONE ? input.moveX : 0;
  let dy = Math.abs(input.moveY) > DEADZONE ? input.moveY : 0;

  const mag = Math.hypot(dx, dy);
  if (mag > 1) { dx /= mag; dy /= mag; }

  Velocity.dx[localPlayerEid] = dx * PLAYER_SPEED;
  Velocity.dy[localPlayerEid] = dy * PLAYER_SPEED;
}

/** Integrates velocity into position. Always use dt for frame-rate independence. */
function movementSystem(world: ReturnType<typeof createWorld>, dt: number): void {
  for (const eid of query(world, [Position, Velocity])) {
    Position.x[eid] += Velocity.dx[eid] * dt;
    Position.y[eid] += Velocity.dy[eid] * dt;
  }
}

/** Keeps player entities within the passable map area. */
function boundsSystem(world: ReturnType<typeof createWorld>): void {
  const maxX = MAP_COLS * TILE_SIZE;
  const maxY = MAP_ROWS * TILE_SIZE;

  for (const eid of query(world, [Position, Velocity, PlayerControlled, Visual])) {
    const hw = Visual.width[eid] / 2;
    const hh = Visual.height[eid] / 2;
    Position.x[eid] = Phaser.Math.Clamp(Position.x[eid], hw, maxX - hw);
    Position.y[eid] = Phaser.Math.Clamp(Position.y[eid], hh, maxY - hh);
  }
}

/** Simple AABB push-out for player vs. solid tiles. */
function solidCollisionSystem(world: ReturnType<typeof createWorld>): void {
  const players = query(world, [Position, Velocity, PlayerControlled, Visual]);
  const solids = query(world, [Position, Solid, Visual]);

  for (const pid of players) {
    for (const sid of solids) {
      const dx = Position.x[pid] - Position.x[sid];
      const dy = Position.y[pid] - Position.y[sid];
      const overlapX = Visual.width[pid] / 2 + Visual.width[sid] / 2 - Math.abs(dx);
      const overlapY = Visual.height[pid] / 2 + Visual.height[sid] / 2 - Math.abs(dy);

      if (overlapX > 0 && overlapY > 0) {
        if (overlapX < overlapY) {
          Position.x[pid] += dx < 0 ? -overlapX : overlapX;
        } else {
          Position.y[pid] += dy < 0 ? -overlapY : overlapY;
        }
      }
    }
  }
}

/** Returns list of {playerEid, gemEid} pairs where a collection occurred. */
function collectionSystem(world: ReturnType<typeof createWorld>): Array<{ playerEid: number; gemEid: number }> {
  const collected: Array<{ playerEid: number; gemEid: number }> = [];
  const players = query(world, [Position, PlayerControlled]);
  const gems = query(world, [Position, Collectible]);

  for (const pid of players) {
    for (const gid of gems) {
      const d = Math.hypot(Position.x[pid] - Position.x[gid], Position.y[pid] - Position.y[gid]);
      if (d < COLLECT_RADIUS) {
        collected.push({ playerEid: pid, gemEid: gid });
      }
    }
  }
  return collected;
}

/** Syncs Position data to Phaser Rectangle positions each frame. */
function renderSystem(world: ReturnType<typeof createWorld>): void {
  for (const eid of query(world, [Position, Visual])) {
    const obj = gameObjects.get(eid);
    if (obj) {
      obj.x = Position.x[eid];
      obj.y = Position.y[eid];
    }
  }
}

// ============================================================
// 4. MAP GENERATION
// ============================================================

const TILE_COLORS: Record<number, number> = {
  0: 0x4a8c3f, // grass (dark)
  1: 0x5da04e, // grass (light)
  2: 0x3a7cc9, // water — solid
  3: 0x8b7355, // dirt path
  4: 0x2d5a1e, // tree  — solid
  5: 0x6b6b6b, // rock  — solid
};

function generateMap(world: ReturnType<typeof createWorld>): void {
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      let type = (row + col) % 2 === 0 ? 0 : 1;

      if (row < 2 || row > MAP_ROWS - 3 || col < 2 || col > MAP_COLS - 3) type = 2;
      else if (
        (row === Math.floor(MAP_ROWS / 2) || col === Math.floor(MAP_COLS / 2))
      ) type = 3;
      else if (type === 0 && (row * 7 + col * 13) % 17 === 0) type = 4;
      else if (type === 1 && (row * 11 + col * 3) % 23 === 0) type = 5;

      const eid = addEntity(world);
      addComponent(world, eid, TileTag);
      addComponent(world, eid, Position);
      addComponent(world, eid, Visual);

      Position.x[eid] = col * TILE_SIZE + TILE_SIZE / 2;
      Position.y[eid] = row * TILE_SIZE + TILE_SIZE / 2;
      Visual.color[eid] = TILE_COLORS[type];
      Visual.width[eid] = TILE_SIZE;
      Visual.height[eid] = TILE_SIZE;

      if (type === 2 || type === 4 || type === 5) {
        addComponent(world, eid, Solid);
      }
    }
  }
}

// ============================================================
// 5. ENTITY HELPERS
// ============================================================

const PLAYER_COLORS = [0xff4444, 0x4444ff, 0x44cc44, 0xffdd00, 0xff44ff];
const SPAWN_POINTS = [
  { x: 640, y: 400 },
  { x: 480, y: 300 },
  { x: 800, y: 300 },
  { x: 480, y: 500 },
  { x: 800, y: 500 },
];

function spawnPlayer(
  world: ReturnType<typeof createWorld>,
  sessionId: string,
  index: number,
): number {
  const eid = addEntity(world);
  addComponent(world, eid, PlayerControlled);
  addComponent(world, eid, Velocity);
  addComponent(world, eid, Position);
  addComponent(world, eid, Visual);

  const spawn = SPAWN_POINTS[index % SPAWN_POINTS.length];
  Position.x[eid] = spawn.x;
  Position.y[eid] = spawn.y;
  Velocity.dx[eid] = 0;
  Velocity.dy[eid] = 0;
  Visual.color[eid] = PLAYER_COLORS[index % PLAYER_COLORS.length];
  Visual.width[eid] = 24;
  Visual.height[eid] = 24;
  PlayerControlled.sessionId[eid] = sessionId;

  return eid;
}

function spawnGem(world: ReturnType<typeof createWorld>): number {
  const eid = addEntity(world);
  addComponent(world, eid, Collectible);
  addComponent(world, eid, Position);
  addComponent(world, eid, Visual);

  // Spawn inside passable area (avoid border tiles)
  Position.x[eid] = Phaser.Math.Between(3 * TILE_SIZE, (MAP_COLS - 3) * TILE_SIZE);
  Position.y[eid] = Phaser.Math.Between(3 * TILE_SIZE, (MAP_ROWS - 3) * TILE_SIZE);
  Visual.color[eid] = 0xffd700;
  Visual.width[eid] = 14;
  Visual.height[eid] = 14;
  Collectible.points[eid] = 1;

  return eid;
}

// ============================================================
// 6. SCENE
// ============================================================

export default class GrasslandGemRush extends BaseScene {
  private world!: ReturnType<typeof createWorld>;
  private inputManager!: InputManager;
  private hud!: HUD;

  private localPlayerEid = -1;
  private timer = GAME_DURATION;
  private gameOver = false;
  private restartTimer = 0;

  // Tracks tile eids so we skip them in the render depth check
  private tileEids = new Set<number>();

  entities: Record<string, EntityDef> = {
    player: { sprite: "player_rect", physics: "dynamic", speed: PLAYER_SPEED },
    gem: { sprite: "gem_rect", physics: "none" },
    tree: { sprite: "tree_rect", physics: "static" },
  };

  constructor() {
    super({ key: "GrasslandGemRush" });
  }

  create(): void {
    this.world = createWorld();
    this.gameOver = false;
    this.timer = GAME_DURATION;
    this.tileEids.clear();
    gameObjects.clear();

    // Observe entity lifecycle to create/destroy Phaser GameObjects.
    // CRITICAL: type-tag components (TileTag, PlayerControlled, Collectible, Solid)
    // must be added BEFORE Position+Visual so the observer fires correctly.
    observe(this.world, onAdd(Position, Visual), (eid: number) => {
      const isTile = this.tileEids.has(eid);
      const rect = this.add.rectangle(
        Position.x[eid],
        Position.y[eid],
        Visual.width[eid],
        Visual.height[eid],
        Visual.color[eid],
      ).setDepth(isTile ? 0 : 10);
      gameObjects.set(eid, rect);
    });

    observe(this.world, onRemove(Position, Visual), (eid: number) => {
      gameObjects.get(eid)?.destroy();
      gameObjects.delete(eid);
    });

    // Generate map (registers TileTag before Position+Visual so observer sees isTile)
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        let type = (row + col) % 2 === 0 ? 0 : 1;

        if (row < 2 || row > MAP_ROWS - 3 || col < 2 || col > MAP_COLS - 3) type = 2;
        else if (row === Math.floor(MAP_ROWS / 2) || col === Math.floor(MAP_COLS / 2)) type = 3;
        else if (type === 0 && (row * 7 + col * 13) % 17 === 0) type = 4;
        else if (type === 1 && (row * 11 + col * 3) % 23 === 0) type = 5;

        const eid = addEntity(this.world);
        this.tileEids.add(eid);
        addComponent(this.world, eid, TileTag);
        addComponent(this.world, eid, Position);
        addComponent(this.world, eid, Visual);

        Position.x[eid] = col * TILE_SIZE + TILE_SIZE / 2;
        Position.y[eid] = row * TILE_SIZE + TILE_SIZE / 2;
        Visual.color[eid] = TILE_COLORS[type];
        Visual.width[eid] = TILE_SIZE;
        Visual.height[eid] = TILE_SIZE;

        if (type === 2 || type === 4 || type === 5) {
          addComponent(this.world, eid, Solid);
        }
      }
    }

    // Input — handles gamepad, keyboard, and touch automatically
    this.inputManager = new InputManager(this);
    this.inputManager.setup();

    // HUD — scores, timer, player list
    this.hud = new HUD(this);
    this.hud.create();

    // Spawn local player (offline demo; real games use StateSync)
    const localId = "local-player";
    this.localPlayerEid = spawnPlayer(this.world, localId, 0);
    this.onPlayerJoin({
      id: "1",
      sessionId: localId,
      name: "You",
      x: SPAWN_POINTS[0].x,
      y: SPAWN_POINTS[0].y,
      score: 0,
      ready: true,
      connected: true,
      customData: {},
    });

    // Initial gems
    for (let i = 0; i < GEM_COUNT; i++) {
      spawnGem(this.world);
    }

    // "How to Play" overlay — dismisses after 5 seconds
    this.showHowToPlay();
  }

  // =============================================
  // How-to-Play overlay
  // =============================================

  private showHowToPlay(): void {
    const overlay = this.add.rectangle(640, 400, 520, 240, 0x000000, 0.75)
      .setScrollFactor(0)
      .setDepth(1900);

    const lines = [
      "GRASSLAND GEM RUSH",
      "",
      "Collect golden gems — first to 10 wins!",
      "",
      "Move:  Left Stick / WASD / Touch joystick",
      "Timer: " + GAME_DURATION + "s — highest score wins on expiry",
    ];

    const text = this.add.text(640, 400, lines, {
      fontSize: "20px",
      color: "#ffffff",
      align: "center",
      lineSpacing: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1901);

    // Dismiss after 5 seconds
    this.time.delayedCall(5000, () => {
      this.tweens.add({
        targets: [overlay, text],
        alpha: 0,
        duration: 400,
        onComplete: () => { overlay.destroy(); text.destroy(); },
      });
    });
  }

  // =============================================
  // Win screen
  // =============================================

  private showWinScreen(winnerName: string): void {
    this.gameOver = true;
    this.restartTimer = 5;

    // Dim overlay
    this.add.rectangle(640, 400, 1280, 800, 0x000000, 0.55)
      .setScrollFactor(0)
      .setDepth(2000);

    this.add.text(640, 320, "WINNER!", {
      fontSize: "72px",
      color: "#ffd700",
      fontStyle: "bold",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    this.add.text(640, 430, winnerName, {
      fontSize: "40px",
      color: "#ffffff",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    const restartText = this.add.text(640, 530, "Restarting in 5…", {
      fontSize: "22px",
      color: "#aaaaaa",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    // Countdown
    this.time.addEvent({
      delay: 1000,
      repeat: 4,
      callback: () => {
        this.restartTimer--;
        restartText.setText(`Restarting in ${this.restartTimer}…`);
        if (this.restartTimer <= 0) {
          this.scene.restart();
        }
      },
    });
  }

  // =============================================
  // BaseScene overrides
  // =============================================

  onUpdate(dt: number, players: PlayerState[]): void {
    if (this.gameOver) return;

    const input = this.inputManager.getState();

    // Run ECS systems in deterministic order
    inputSystem(this.world, input, this.localPlayerEid);
    movementSystem(this.world, dt);
    boundsSystem(this.world);
    solidCollisionSystem(this.world);

    // Gem collection
    const collected = collectionSystem(this.world);
    for (const { playerEid, gemEid } of collected) {
      const sessionId = PlayerControlled.sessionId[playerEid];
      const player = this.players.get(sessionId);
      if (player) {
        player.score = (player.score ?? 0) + 1;

        // Visual feedback: flash the gem position, then remove it
        const obj = gameObjects.get(gemEid);
        if (obj) {
          this.tweens.add({
            targets: obj,
            scaleX: 2, scaleY: 2,
            alpha: 0,
            duration: 180,
            ease: "Cubic.Out",
            onComplete: () => {
              removeEntity(this.world, gemEid);
              spawnGem(this.world);
            },
          });
          // Remove from tracking so renderSystem won't update it after removal
          gameObjects.delete(gemEid);
        } else {
          removeEntity(this.world, gemEid);
          spawnGem(this.world);
        }
      }
    }

    // Sync ECS positions → Phaser GameObjects
    renderSystem(this.world);

    // Timer
    this.timer = Math.max(0, this.timer - dt);

    // HUD
    const localPlayer = this.players.get("local-player");
    if (localPlayer) {
      this.hud.updateScore(localPlayer.score ?? 0);
    }
    this.hud.updateTimer(this.timer);
    this.hud.updatePlayerList(players);

    // Win check (also handled by BaseScene's checkWinCondition, but we need
    // the winner name to show the overlay)
    const winnerSessionId = this.checkWinCondition(players);
    if (winnerSessionId) {
      const winner = this.players.get(winnerSessionId);
      this.showWinScreen(winner?.name ?? "Player");
    }
  }

  checkWinCondition(players: PlayerState[]): string | null {
    if (this.gameOver) return null;

    // Score target
    const byScore = players.find((p) => (p.score ?? 0) >= WIN_SCORE);
    if (byScore) return byScore.sessionId;

    // Time expiry — highest score wins
    if (this.timer <= 0 && players.length > 0) {
      const sorted = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      return sorted[0].sessionId;
    }

    return null;
  }
}

// ============================================================
// SYSTEM FUNCTIONS (standalone so they can be tree-shaken if unused)
// — defined at module level to avoid recreating closures each frame —
// ============================================================

// Re-export for testing if needed
export { generateMap, spawnGem, spawnPlayer };
