import { BaseScene, InputManager, HUD } from "@sdr/engine";
import type { PlayerState, EntityDef } from "@sdr/shared";
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

// Components
const Position = { x: [] as number[], y: [] as number[] };
const Velocity = { dx: [] as number[], dy: [] as number[] };
const Stone = { ownerId: [] as string[], size: [] as number[] };
const Target = { ring: [] as number[] };
const GrowthRay = { ownerId: [] as string[], active: [] as boolean[] };
const Visual = { color: [] as number[], radius: [] as number[] };

type World = ReturnType<typeof createWorld>;

interface StoneData {
  eid: number;
  ownerId: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  size: number;
}

interface GrowthRayData {
  eid: number;
  ownerId: string;
  active: boolean;
}

export default class PrehistoricCurling extends BaseScene {
  entities: Record<string, EntityDef> = {};

  private world!: World;
  private inputManager!: InputManager;
  private hud!: HUD;
  private gameObjects!: Map<number, Phaser.GameObjects.Graphics>;
  private targetSprite!: Phaser.GameObjects.Sprite;
  private howToPlayText!: Phaser.GameObjects.Text;
  private howToPlayTimer: number = 5;
  private showingHowToPlay: boolean = true;

  private readonly WORLD_WIDTH = 1280;
  private readonly WORLD_HEIGHT = 800;
  private readonly TARGET_X = 640;
  private readonly TARGET_Y = 150;
  private readonly START_Y = 700;
  private readonly FRICTION = 0.95;
  private readonly STONE_BASE_SIZE = 30;
  private readonly MAX_STONE_SIZE = 100;

  constructor() {
    super({ key: "PrehistoricCurling" });
  }

  preload(): void {
    // Load star sprite for target
    this.load.image("star", "/games/DATE/assets/star.png");
  }

  create(): void {
    // Initialize ECS world
    this.world = createWorld();
    this.gameObjects = new Map();

    // Set up background
    this.add.rectangle(640, 400, 1280, 800, 0x8b7355);

    // Create target rings
    this.add.circle(this.TARGET_X, this.TARGET_Y, 80, 0xff0000, 0.3);
    this.add.circle(this.TARGET_X, this.TARGET_Y, 60, 0xffff00, 0.3);
    this.add.circle(this.TARGET_X, this.TARGET_Y, 40, 0x00ff00, 0.3);

    // Add star sprite at center
    this.targetSprite = this.add.sprite(this.TARGET_X, this.TARGET_Y, "star");
    this.targetSprite.setScale(0.3);
    this.targetSprite.setAlpha(0.7);

    // Set up input
    this.inputManager = new InputManager(this);
    this.inputManager.setup({ throw: "A", grow: "B" });

    // Set up HUD
    this.hud = new HUD(this);
    this.hud.create();

    // How to Play overlay
    const overlay = this.add.rectangle(640, 400, 800, 400, 0x000000, 0.8);
    this.howToPlayText = this.add.text(640, 300, "HOW TO PLAY\n\nAim with stick, press A to throw stone\nPress B to activate growth ray\nGrow your stones, shrink opponents!\nClosest to center wins!", {
      fontSize: "28px",
      color: "#ffffff",
      align: "center",
      fontFamily: "Arial",
    });
    this.howToPlayText.setOrigin(0.5);

    // Set up observers for entity lifecycle
    observe(this.world, onAdd(Position, Stone, Visual), (eid: number) => {
      const graphics = this.add.graphics();
      this.gameObjects.set(eid, graphics);
      this.updateStoneVisual(eid);
    });

    observe(this.world, onRemove(Position, Stone), (eid: number) => {
      this.gameObjects.get(eid)?.destroy();
      this.gameObjects.delete(eid);
    });

    observe(this.world, onAdd(GrowthRay), (eid: number) => {
      const graphics = this.add.graphics();
      this.gameObjects.set(eid, graphics);
    });

    observe(this.world, onRemove(GrowthRay), (eid: number) => {
      this.gameObjects.get(eid)?.destroy();
      this.gameObjects.delete(eid);
    });

    // Listen for server updates
    this.game.events.on("stone-update", this.handleStoneUpdate, this);
    this.game.events.on("growth-ray-update", this.handleGrowthRayUpdate, this);
    this.game.events.on("remove-entity", this.handleRemoveEntity, this);
  }

  onUpdate(dt: number, players: PlayerState[]): void {
    // Hide how to play after 5 seconds
    if (this.showingHowToPlay) {
      this.howToPlayTimer -= dt;
      if (this.howToPlayTimer <= 0) {
        this.showingHowToPlay = false;
        this.howToPlayText.destroy();
      }
    }

    // Handle input
    const input = this.inputManager.getState();
    const myPlayer = Array.from(this.players.values()).find(
      (p) => p.sessionId === this.game.registry.get("sessionId")
    );

    if (myPlayer && input.buttons.throw) {
      this.game.events.emit("player-action", "throw", {
        angle: Math.atan2(input.y, input.x),
        power: Math.sqrt(input.x * input.x + input.y * input.y),
      });
    }

    if (myPlayer && input.buttons.grow) {
      this.game.events.emit("player-action", "activate-ray", {});
    }

    // Update stone physics
    for (const eid of query(this.world, [Position, Velocity, Stone])) {
      Position.x[eid] += Velocity.dx[eid] * dt;
      Position.y[eid] += Velocity.dy[eid] * dt;

      Velocity.dx[eid] *= Math.pow(this.FRICTION, dt * 60);
      Velocity.dy[eid] *= Math.pow(this.FRICTION, dt * 60);

      // Stop if moving very slowly
      if (Math.abs(Velocity.dx[eid]) < 1 && Math.abs(Velocity.dy[eid]) < 1) {
        Velocity.dx[eid] = 0;
        Velocity.dy[eid] = 0;
      }

      this.updateStoneVisual(eid);
    }

    // Update growth ray visuals
    for (const eid of query(this.world, [GrowthRay])) {
      if (GrowthRay.active[eid]) {
        const graphics = this.gameObjects.get(eid);
        if (graphics) {
          graphics.clear();
          const ownerId = GrowthRay.ownerId[eid];
          const player = this.players.get(ownerId);
          if (player) {
            const px = (player.customData.x as number) || 640;
            const py = (player.customData.y as number) || this.START_Y;
            graphics.lineStyle(3, 0x00ff00, 0.6);
            graphics.beginPath();
            graphics.arc(px, py, 150, 0, Math.PI * 2);
            graphics.strokePath();
          }
        }
      }
    }

    // Update HUD
    const timer = (players[0]?.customData.timer as number) || 0;
    this.hud.updateTimer(timer);
    this.hud.updatePlayerList(players);
  }

  checkWinCondition(players: PlayerState[]): string | null {
    const phase = players[0]?.customData.phase as string;
    const winnerId = players[0]?.customData.winnerId as string;
    if (phase === "finished" && winnerId) {
      return winnerId;
    }
    return null;
  }

  private updateStoneVisual(eid: number): void {
    const graphics = this.gameObjects.get(eid);
    if (!graphics) return;

    const x = Position.x[eid];
    const y = Position.y[eid];
    const size = Stone.size[eid];
    const ownerId = Stone.ownerId[eid];
    const color = Visual.color[eid];

    graphics.clear();
    graphics.fillStyle(color, 0.8);
    graphics.fillCircle(x, y, size);
    graphics.lineStyle(3, 0x000000, 0.5);
    graphics.strokeCircle(x, y, size);
  }

  private handleStoneUpdate(data: StoneData): void {
    let eid = data.eid;
    const existing = [...query(this.world, [Stone])].find((e) => e === eid);

    if (!existing) {
      eid = addEntity(this.world);
      addComponent(this.world, eid, Position);
      addComponent(this.world, eid, Velocity);
      addComponent(this.world, eid, Stone);
      addComponent(this.world, eid, Visual);
    }

    Position.x[eid] = data.x;
    Position.y[eid] = data.y;
    Velocity.dx[eid] = data.dx;
    Velocity.dy[eid] = data.dy;
    Stone.size[eid] = data.size;
    Stone.ownerId[eid] = data.ownerId;

    // Assign color based on owner
    const playerIndex = Array.from(this.players.values()).findIndex(
      (p) => p.sessionId === data.ownerId
    );
    const colors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x95e1d3, 0xf38181];
    Visual.color[eid] = colors[playerIndex % colors.length];
    Visual.radius[eid] = data.size;
  }

  private handleGrowthRayUpdate(data: GrowthRayData): void {
    let eid = data.eid;
    const existing = [...query(this.world, [GrowthRay])].find((e) => e === eid);

    if (!existing) {
      eid = addEntity(this.world);
      addComponent(this.world, eid, GrowthRay);
    }

    GrowthRay.ownerId[eid] = data.ownerId;
    GrowthRay.active[eid] = data.active;

    if (!data.active) {
      this.gameObjects.get(eid)?.clear();
    }
  }

  private handleRemoveEntity(eid: number): void {
    if (this.gameObjects.has(eid)) {
      removeEntity(this.world, eid);
    }
  }
}

export function launch(containerId: string): { destroy: () => void } {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: 1280,
    height: 800,
    parent: containerId,
    physics: {
      default: "arcade",
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    scene: [PrehistoricCurling],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { gamepad: true },
  });
  return { destroy: () => game.destroy(true) };
}