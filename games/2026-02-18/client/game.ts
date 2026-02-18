import { BaseScene, InputManager, MultiplayerClient, HUD } from "@sdr/engine";
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
const Stone = { ownerId: [] as string[], size: [] as number[], power: [] as number[] };
const Target = { points: [] as number[] };
const GrowthRay = { ownerId: [] as string[], active: [] as boolean[] };
const Visual = { width: [] as number[], height: [] as number[], color: [] as number[] };

type WorldType = ReturnType<typeof createWorld>;

export default class PrehistoricCurling extends BaseScene {
  entities: Record<string, EntityDef> = {};

  private world!: WorldType;
  private mpClient: MultiplayerClient | null = null;
  private inputManager!: InputManager;
  private hud!: HUD;

  private gameObjects = new Map<number, Phaser.GameObjects.GameObject>();
  private stoneSprites = new Map<number, Phaser.GameObjects.Sprite>();
  private rayGraphics = new Map<number, Phaser.GameObjects.Graphics>();

  private hasShot = false;
  private shootCooldown = 0;
  private rayActive = false;
  private rayCooldown = 0;

  private powerMeter: Phaser.GameObjects.Rectangle | null = null;
  private powerBg: Phaser.GameObjects.Rectangle | null = null;
  private powerText: Phaser.GameObjects.Text | null = null;

  private howToPlayOverlay: Phaser.GameObjects.Container | null = null;
  private overlayTimer = 5;

  constructor() {
    super({ key: "PrehistoricCurling" });
  }

  setMultiplayerClient(client: MultiplayerClient): void {
    this.mpClient = client;
    this.mpClient.setCallbacks({
      onPlayerJoin: (player: PlayerState) => {
        this.onPlayerJoin(player);
      },
      onPlayerLeave: (sessionId: string) => {
        this.onPlayerLeave(sessionId);
      },
      onStateChange: (state: Record<string, unknown>) => {
        this.handleStateChange(state);
      },
      onGameEvent: (event: string, data: unknown) => {
        this.handleGameEvent(event, data);
      },
      onError: (error: Error) => {
        console.error("Multiplayer error:", error);
      },
    });
  }

  preload(): void {
    this.load.spritesheet(
      "stone",
      "/games/DATE/assets/character-unknown-1.png",
      { frameWidth: 32, frameHeight: 32 }
    );
  }

  create(): void {
    this.world = createWorld();
    this.inputManager = new InputManager(this);
    this.inputManager.setup({ space: "SPACE", action: "Z" });

    this.hud = new HUD(this);
    this.hud.create();

    // Background
    this.add.rectangle(640, 400, 1280, 800, 0x2d5016);

    // Ice rink
    this.add.rectangle(640, 400, 1200, 700, 0xb8d4e8);

    // Target circles
    this.createTargetCircles();

    // Power meter UI
    this.powerBg = this.add.rectangle(100, 750, 200, 30, 0x333333);
    this.powerMeter = this.add.rectangle(100, 750, 0, 30, 0xff0000);
    this.powerText = this.add.text(100, 760, "POWER", {
      fontSize: "16px",
      color: "#ffffff",
    });
    this.powerText.setOrigin(0.5, 0.5);

    // How to Play overlay
    this.createHowToPlayOverlay();

    // Set up observers
    this.setupObservers();
  }

  private createTargetCircles(): void {
    const centerX = 640;
    const centerY = 200;

    // Outer circle (5 points)
    const outer = this.add.circle(centerX, centerY, 100, 0xff6b6b, 0.5);
    const outerEid = addEntity(this.world);
    addComponent(this.world, outerEid, Position);
    addComponent(this.world, outerEid, Target);
    Position.x[outerEid] = centerX;
    Position.y[outerEid] = centerY;
    Target.points[outerEid] = 5;
    this.gameObjects.set(outerEid, outer);

    // Middle circle (10 points)
    const middle = this.add.circle(centerX, centerY, 60, 0xffd93d, 0.5);
    const middleEid = addEntity(this.world);
    addComponent(this.world, middleEid, Position);
    addComponent(this.world, middleEid, Target);
    Position.x[middleEid] = centerX;
    Position.y[middleEid] = centerY;
    Target.points[middleEid] = 10;
    this.gameObjects.set(middleEid, middle);

    // Inner circle (20 points)
    const inner = this.add.circle(centerX, centerY, 30, 0x6bcf7f, 0.5);
    const innerEid = addEntity(this.world);
    addComponent(this.world, innerEid, Position);
    addComponent(this.world, innerEid, Target);
    Position.x[innerEid] = centerX;
    Position.y[innerEid] = centerY;
    Target.points[innerEid] = 20;
    this.gameObjects.set(innerEid, inner);
  }

  private createHowToPlayOverlay(): void {
    const bg = this.add.rectangle(640, 400, 800, 400, 0x000000, 0.8);
    const title = this.add.text(640, 250, "HOW TO PLAY", {
      fontSize: "32px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    title.setOrigin(0.5);

    const instructions = this.add.text(
      640,
      350,
      "Left Stick/WASD: Aim\nSPACE: Charge & Release Stone\nZ: Fire Growth Ray (enlarge your stone)\n\nLand closest to center to score points!\nBigger stones can knock others away!",
      {
        fontSize: "20px",
        color: "#ffffff",
        align: "center",
      }
    );
    instructions.setOrigin(0.5);

    this.howToPlayOverlay = this.add.container(0, 0, [bg, title, instructions]);
  }

  private setupObservers(): void {
    observe(this.world, onAdd(Stone), (eid: number) => {
      const sprite = this.add.sprite(
        Position.x[eid],
        Position.y[eid],
        "stone",
        Stone.ownerId[eid].charCodeAt(0) % 900
      );
      sprite.setScale(Stone.size[eid]);
      this.stoneSprites.set(eid, sprite);
      this.gameObjects.set(eid, sprite);
    });

    observe(this.world, onRemove(Stone), (eid: number) => {
      const sprite = this.stoneSprites.get(eid);
      if (sprite) {
        sprite.destroy();
        this.stoneSprites.delete(eid);
      }
      this.gameObjects.delete(eid);
    });

    observe(this.world, onAdd(GrowthRay), (eid: number) => {
      const graphics = this.add.graphics();
      this.rayGraphics.set(eid, graphics);
      this.gameObjects.set(eid, graphics);
    });

    observe(this.world, onRemove(GrowthRay), (eid: number) => {
      const graphics = this.rayGraphics.get(eid);
      if (graphics) {
        graphics.destroy();
        this.rayGraphics.delete(eid);
      }
      this.gameObjects.delete(eid);
    });
  }

  private handleStateChange(state: Record<string, unknown>): void {
    const entities = state.entities as Array<{
      id: number;
      type: string;
      x: number;
      y: number;
      dx?: number;
      dy?: number;
      ownerId?: string;
      size?: number;
      power?: number;
      active?: boolean;
    }> | undefined;

    if (!entities) return;

    // Clear existing entities
    for (const eid of query(this.world, [Stone])) {
      removeEntity(this.world, eid);
    }
    for (const eid of query(this.world, [GrowthRay])) {
      removeEntity(this.world, eid);
    }

    // Create entities from state
    for (const entityData of entities) {
      if (entityData.type === "stone") {
        const eid = addEntity(this.world);
        addComponent(this.world, eid, Position);
        addComponent(this.world, eid, Velocity);
        addComponent(this.world, eid, Stone);
        Position.x[eid] = entityData.x;
        Position.y[eid] = entityData.y;
        Velocity.dx[eid] = entityData.dx || 0;
        Velocity.dy[eid] = entityData.dy || 0;
        Stone.ownerId[eid] = entityData.ownerId || "";
        Stone.size[eid] = entityData.size || 1;
        Stone.power[eid] = entityData.power || 0;
      } else if (entityData.type === "ray") {
        const eid = addEntity(this.world);
        addComponent(this.world, eid, Position);
        addComponent(this.world, eid, GrowthRay);
        Position.x[eid] = entityData.x;
        Position.y[eid] = entityData.y;
        GrowthRay.ownerId[eid] = entityData.ownerId || "";
        GrowthRay.active[eid] = entityData.active || false;
      }
    }
  }

  private handleGameEvent(event: string, data: unknown): void {
    if (event === "stoneCollision") {
      // Visual feedback for collision
      this.cameras.main.shake(100, 0.005);
    }
  }

  onUpdate(dt: number, players: PlayerState[]): void {
    // Hide overlay after timer
    if (this.overlayTimer > 0) {
      this.overlayTimer -= dt;
      if (this.overlayTimer <= 0 && this.howToPlayOverlay) {
        this.howToPlayOverlay.destroy();
        this.howToPlayOverlay = null;
      }
    }

    const input = this.inputManager.getState();
    this.mpClient?.sendInput(input);

    // Update cooldowns
    if (this.shootCooldown > 0) {
      this.shootCooldown -= dt;
    }
    if (this.rayCooldown > 0) {
      this.rayCooldown -= dt;
    }

    // Shooting mechanics
    if (input.buttons.space && !this.hasShot && this.shootCooldown <= 0) {
      // Charging
      const chargeAmount = Math.min(1, (this.shootCooldown + dt) * 0.5);
      if (this.powerMeter) {
        this.powerMeter.width = chargeAmount * 200;
      }
      this.mpClient?.sendAction("charge", { power: chargeAmount });
    } else if (!input.buttons.space && this.hasShot) {
      // Release
      this.mpClient?.sendAction("shoot", {
        dx: input.x,
        dy: input.y,
      });
      this.hasShot = false;
      this.shootCooldown = 3;
      if (this.powerMeter) {
        this.powerMeter.width = 0;
      }
    }

    if (input.buttons.space) {
      this.hasShot = true;
    }

    // Growth ray
    if (input.buttons.action && this.rayCooldown <= 0 && !this.rayActive) {
      this.mpClient?.sendAction("fireRay", {});
      this.rayActive = true;
      this.rayCooldown = 5;
    } else if (!input.buttons.action) {
      this.rayActive = false;
    }

    // Update stone positions and velocities
    for (const eid of query(this.world, [Position, Velocity, Stone])) {
      Position.x[eid] += Velocity.dx[eid] * dt;
      Position.y[eid] += Velocity.dy[eid] * dt;

      // Apply friction
      Velocity.dx[eid] *= 0.98;
      Velocity.dy[eid] *= 0.98;

      // Stop if too slow
      if (
        Math.abs(Velocity.dx[eid]) < 0.1 &&
        Math.abs(Velocity.dy[eid]) < 0.1
      ) {
        Velocity.dx[eid] = 0;
        Velocity.dy[eid] = 0;
      }

      const sprite = this.stoneSprites.get(eid);
      if (sprite) {
        sprite.setPosition(Position.x[eid], Position.y[eid]);
        sprite.setScale(Stone.size[eid]);
      }
    }

    // Update growth rays
    for (const eid of query(this.world, [Position, GrowthRay])) {
      const graphics = this.rayGraphics.get(eid);
      if (graphics && GrowthRay.active[eid]) {
        graphics.clear();
        graphics.lineStyle(5, 0x00ff00, 1);
        graphics.beginPath();
        graphics.moveTo(Position.x[eid], 700);
        graphics.lineTo(Position.x[eid], Position.y[eid]);
        graphics.strokePath();
      } else if (graphics) {
        graphics.clear();
      }
    }

    // Update HUD
    const sessionId = this.mpClient?.getSessionId();
    const currentPlayer = players.find((p: PlayerState) => p.sessionId === sessionId);
    if (currentPlayer) {
      this.hud.updateScore(currentPlayer.score || 0);
    }
    this.hud.updatePlayerList(players);
  }

  checkWinCondition(players: PlayerState[]): string | null {
    const maxScore = Math.max(...players.map((p: PlayerState) => p.score || 0));
    if (maxScore >= 50) {
      const winner = players.find((p: PlayerState) => (p.score || 0) === maxScore);
      return winner ? winner.sessionId : null;
    }
    return null;
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