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
const Stone = { ownerId: [] as string[], power: [] as number[], growing: [] as boolean[] };
const Target = { points: [] as number[] };
const Visual = { width: [] as number[], height: [] as number[], color: [] as number[] };
const Sprite = { key: [] as string[] };

interface EntityData {
  eid: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  type: "stone" | "target";
  ownerId?: string;
  power?: number;
  growing?: boolean;
  points?: number;
  width?: number;
  height?: number;
  color?: number;
}

export default class PrehistoricCurling extends BaseScene {
  entities: Record<string, EntityDef> = {};
  
  private world!: ReturnType<typeof createWorld>;
  private mpClient: MultiplayerClient | null = null;
  private inputManager!: InputManager;
  private hud!: HUD;
  private gameObjects = new Map<number, Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle>();
  private entityMap = new Map<number, number>(); // server eid -> client eid
  private reverseEntityMap = new Map<number, number>(); // client eid -> server eid
  private throwLine: Phaser.GameObjects.Graphics | null = null;
  private powerMeter: Phaser.GameObjects.Rectangle | null = null;
  private powerBg: Phaser.GameObjects.Rectangle | null = null;
  private charging = false;
  private chargeTime = 0;
  private maxCharge = 2;
  private stoneThrown = false;
  private howToPlayText: Phaser.GameObjects.Text | null = null;
  private growthRayActive = false;
  private growthRayGraphics: Phaser.GameObjects.Graphics | null = null;

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
        // Handle full state updates if needed
      },
      onGameEvent: (event: string, data: unknown) => {
        if (event === "entityUpdate") {
          this.handleEntityUpdate(data as EntityData[]);
        } else if (event === "clearStones") {
          this.clearAllStones();
        }
      },
      onError: (error: Error) => {
        console.error("Multiplayer error:", error);
      },
    });
  }

  preload(): void {
    console.log('[SDR] preload() starting');
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error('[SDR] LOAD ERROR:', file.key, file.url);
    });
    this.load.on('complete', () => {
      console.log('[SDR] Load complete. Textures:', Object.keys(this.textures.list));
    });
    this.load.image("ball", "/games/2026-02-18/assets/ball.png");
    this.load.image("star", "/games/2026-02-18/assets/star.png");
  }

  create(): void {
    this.world = createWorld();
    this.inputManager = new InputManager(this);
    this.inputManager.setup({ space: "SPACE", action: "Z" });
    this.hud = new HUD(this);
    this.hud.create();

    // Background
    this.add.rectangle(640, 400, 1280, 800, 0x8B7355);

    // Ice rink
    const ice = this.add.rectangle(640, 400, 1200, 700, 0xCCE5FF);
    ice.setStrokeStyle(4, 0x6699CC);

    // Target zones (3 rings)
    const targetX = 640;
    const targetY = 150;
    this.add.circle(targetX, targetY, 120, 0xFF6B6B, 0.3);
    this.add.circle(targetX, targetY, 80, 0xFFD93D, 0.3);
    this.add.circle(targetX, targetY, 40, 0x6BCB77, 0.3);

    // Throwing line
    this.throwLine = this.add.graphics();
    this.throwLine.lineStyle(2, 0xFFFFFF, 0.5);
    this.throwLine.lineTo(0, 700);
    this.throwLine.setPosition(40, 0);

    // Power meter background
    this.powerBg = this.add.rectangle(1200, 400, 40, 200, 0x333333);
    this.powerBg.setVisible(false);

    // Power meter fill
    this.powerMeter = this.add.rectangle(1200, 500, 36, 0, 0x4CAF50);
    this.powerMeter.setVisible(false);
    this.powerMeter.setOrigin(0.5, 1);

    // Growth ray graphics
    this.growthRayGraphics = this.add.graphics();

    // How to play overlay
    this.howToPlayText = this.add.text(640, 400, 
      "PREHISTORIC CURLING\n\n" +
      "Slide your stone down the ice!\n" +
      "Hold R2/SPACE to charge power\n" +
      "Release to throw\n" +
      "Press A/Z to activate GROWTH RAY\n" +
      "Make your stone bigger!\n\n" +
      "Closest to center wins!",
      {
        fontSize: "32px",
        color: "#ffffff",
        backgroundColor: "#000000",
        padding: { x: 40, y: 40 },
        align: "center",
      }
    );
    this.howToPlayText.setOrigin(0.5);
    this.time.delayedCall(5000, () => {
      this.howToPlayText?.destroy();
      this.howToPlayText = null;
    });

    // Set up observers
    this.setupObservers();

    // Spawn demo stones immediately so sprites are visible even without a server
    this.spawnDemoEntities();
  }

  private spawnDemoEntities(): void {
    // Spawn a demo stone and target so sprites are visible in single-player/offline mode
    // These will be replaced by real server entities when multiplayer connects
    console.log('[SDR] Spawning demo entities for offline preview');
    this.handleEntityUpdate([
      { eid: 9001, type: 'stone', x: 640, y: 600, dx: 0, dy: 0, ownerId: 'demo', power: 0, growing: false },
      { eid: 9002, type: 'stone', x: 580, y: 550, dx: 0, dy: 0, ownerId: 'demo2', power: 0, growing: false },
      { eid: 9003, type: 'target', x: 640, y: 150, dx: 0, dy: 0, points: 10 },
    ]);
  }

  private setupObservers(): void {
    observe(this.world, onAdd(Position, Stone, Sprite), (eid: number) => {
      const sprite = this.add.sprite(
        Position.x[eid],
        Position.y[eid],
        Sprite.key[eid]
      );
      sprite.setScale(0.5);
      this.gameObjects.set(eid, sprite);
    });

    observe(this.world, onAdd(Position, Visual), (eid: number) => {
      const rect = this.add.rectangle(
        Position.x[eid],
        Position.y[eid],
        Visual.width[eid],
        Visual.height[eid],
        Visual.color[eid]
      );
      this.gameObjects.set(eid, rect);
    });

    observe(this.world, onRemove(Position), (eid: number) => {
      const obj = this.gameObjects.get(eid);
      if (obj) {
        obj.destroy();
        this.gameObjects.delete(eid);
      }
      const serverEid = this.reverseEntityMap.get(eid);
      if (serverEid !== undefined) {
        this.entityMap.delete(serverEid);
        this.reverseEntityMap.delete(eid);
      }
    });
  }

  private handleEntityUpdate(entities: EntityData[]): void {
    for (const data of entities) {
      let clientEid = this.entityMap.get(data.eid);

      if (!clientEid) {
        clientEid = addEntity(this.world);
        this.entityMap.set(data.eid, clientEid);
        this.reverseEntityMap.set(clientEid, data.eid);

        addComponent(this.world, clientEid, Position);
        addComponent(this.world, clientEid, Velocity);

        if (data.type === "stone") {
          addComponent(this.world, clientEid, Stone);
          Stone.ownerId[clientEid] = data.ownerId || "";
          Stone.power[clientEid] = data.power || 0;
          Stone.growing[clientEid] = data.growing || false;
          // Create sprite directly (bitecs doesn't support string arrays)
          const textureKey = "ball";
          console.log('[SDR] Creating stone sprite with texture:', textureKey, 'exists:', this.textures.exists(textureKey));
          const sprite = this.add.sprite(data.x, data.y, textureKey);
          sprite.setScale(0.5);
          this.gameObjects.set(clientEid, sprite);
        } else if (data.type === "target") {
          addComponent(this.world, clientEid, Target);
          Target.points[clientEid] = data.points || 0;
          const textureKey = "star";
          console.log('[SDR] Creating target sprite with texture:', textureKey, 'exists:', this.textures.exists(textureKey));
          const sprite = this.add.sprite(data.x, data.y, textureKey);
          sprite.setScale(0.5);
          this.gameObjects.set(clientEid, sprite);
        }
      }

      Position.x[clientEid] = data.x;
      Position.y[clientEid] = data.y;
      Velocity.dx[clientEid] = data.dx;
      Velocity.dy[clientEid] = data.dy;

      if (data.type === "stone") {
        Stone.power[clientEid] = data.power || 0;
        Stone.growing[clientEid] = data.growing || false;
      }
    }
  }

  private clearAllStones(): void {
    for (const eid of query(this.world, [Position, Stone])) {
      removeEntity(this.world, eid);
    }
  }

  onUpdate(dt: number, players: PlayerState[]): void {
    const kbInput = this.inputManager.getState();
    const touch = this.registry.get("touchInput") as {
      x: number;
      y: number;
      buttons: Record<string, boolean>;
    } | null;

    const input = {
      x: kbInput.x !== 0 ? kbInput.x : touch?.x ?? 0,
      y: kbInput.y !== 0 ? kbInput.y : touch?.y ?? 0,
      buttons: {
        ...kbInput.buttons,
        ...(touch
          ? Object.fromEntries(
              Object.entries(touch.buttons).map(([k, v]) => [
                k,
                v || kbInput.buttons[k as keyof typeof kbInput.buttons],
              ])
            )
          : {}),
      },
    };

    // Handle charging
    if (!this.stoneThrown && input.buttons.space && !this.charging) {
      this.charging = true;
      this.chargeTime = 0;
      this.powerBg?.setVisible(true);
      this.powerMeter?.setVisible(true);
    }

    if (this.charging) {
      this.chargeTime += dt;
      const power = Math.min(this.chargeTime / this.maxCharge, 1);
      const meterHeight = power * 196;
      if (this.powerMeter) {
        const meter = this.powerMeter as Phaser.GameObjects.Rectangle;
        meter.height = meterHeight;
        meter.y = 500 - (meterHeight / 2);
      }

      if (!input.buttons.space) {
        this.charging = false;
        this.stoneThrown = true;
        this.powerBg?.setVisible(false);
        this.powerMeter?.setVisible(false);

        const throwPower = Math.min(this.chargeTime / this.maxCharge, 1);
        this.mpClient?.sendAction("throwStone", { power: throwPower });
      }
    }

    // Handle growth ray
    if (input.buttons.action && !this.growthRayActive) {
      this.growthRayActive = true;
      this.mpClient?.sendAction("activateGrowthRay", {});
    }

    if (!input.buttons.action && this.growthRayActive) {
      this.growthRayActive = false;
    }

    // Update positions
    for (const eid of query(this.world, [Position, Velocity])) {
      Position.x[eid] += Velocity.dx[eid] * dt;
      Position.y[eid] += Velocity.dy[eid] * dt;
    }

    // Render
    for (const eid of query(this.world, [Position, Stone])) {
      const obj = this.gameObjects.get(eid) as Phaser.GameObjects.Sprite;
      if (obj) {
        obj.x = Position.x[eid];
        obj.y = Position.y[eid];
        
        const basePower = Stone.power[eid];
        const scale = 0.5 + (basePower * 0.5);
        obj.setScale(scale);

        // Draw growth ray effect
        if (Stone.growing[eid]) {
          this.growthRayGraphics?.clear();
          this.growthRayGraphics?.lineStyle(3, 0x00FF00, 0.6);
          const mySessionId = this.mpClient?.getSessionId();
          const myPlayer = players.find((p: PlayerState) => p.sessionId === mySessionId);
          if (myPlayer) {
            const playerX = (myPlayer.customData.x as number) || 640;
            const playerY = (myPlayer.customData.y as number) || 750;
            this.growthRayGraphics?.lineBetween(playerX, playerY, obj.x, obj.y);
          }
        }
      }
    }

    if (!this.growthRayActive) {
      this.growthRayGraphics?.clear();
    }

    for (const eid of query(this.world, [Position, Target])) {
      const obj = this.gameObjects.get(eid) as Phaser.GameObjects.Sprite;
      if (obj) {
        obj.x = Position.x[eid];
        obj.y = Position.y[eid];
      }
    }

    // Update HUD
    const mySessionId = this.mpClient?.getSessionId();
    const myPlayer = players.find((p: PlayerState) => p.sessionId === mySessionId);
    this.hud.updateScore(myPlayer?.score || 0);
    this.hud.updatePlayerList(players);

    this.mpClient?.sendInput(input);
  }

  checkWinCondition(players: PlayerState[]): string | null {
    return null; // Server handles win conditions
  }

  onPlayerJoin(player: PlayerState): void {
    super.onPlayerJoin(player);
  }

  onPlayerLeave(sessionId: string): void {
    super.onPlayerLeave(sessionId);
  }
}

export function launch(
  containerId: string,
  options?: {
    isMobile?: boolean;
    touchInput?: {
      x: number;
      y: number;
      buttons: Record<string, boolean>;
    };
  }
): { destroy: () => void } {
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

  game.events.once("ready", () => {
    game.registry.set("touchInput", options?.touchInput ?? null);
    game.registry.set("isMobile", options?.isMobile ?? false);
  });

  return { destroy: () => game.destroy(true) };
}