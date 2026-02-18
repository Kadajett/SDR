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
const Size = { radius: [] as number[] };
const Color = { value: [] as number[] };
const Stone = { sessionId: [] as string[], launched: [] as boolean[] };
const Target = { ring: [] as number[] }; // 1=outer, 2=middle, 3=center
const GrowthRay = {
  sessionId: [] as string[],
  active: [] as boolean[],
  cooldown: [] as number[],
};

interface Vec2 {
  x: number;
  y: number;
}

export default class PrehistoricCurling extends BaseScene {
  entities: Record<string, EntityDef> = {};

  private world!: ReturnType<typeof createWorld>;
  private inputManager!: InputManager;
  private hud!: HUD;
  private gameObjects!: Map<number, Phaser.GameObjects.Arc>;
  private targetRings!: Phaser.GameObjects.Arc[];
  private playerColors: Map<string, number> = new Map();
  private throwOrder: string[] = [];
  private currentThrower: number = 0;
  private roundNumber: number = 1;
  private maxRounds: number = 3;
  private showHowToPlay: boolean = true;
  private howToPlayTimer: number = 5;
  private howToPlayText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private powerMeter!: Phaser.GameObjects.Rectangle;
  private powerMeterBg!: Phaser.GameObjects.Rectangle;
  private chargingPower: boolean = false;
  private currentPower: number = 0;
  private powerDirection: number = 1;
  private hasLaunched: boolean = false;
  private roundActive: boolean = false;

  private readonly FRICTION: number = 0.98;
  private readonly MIN_VELOCITY: number = 5;
  private readonly MAX_POWER: number = 800;
  private readonly POWER_CHARGE_RATE: number = 1.5;
  private readonly GROWTH_RAY_COOLDOWN: number = 3;
  private readonly GROWTH_MULTIPLIER: number = 1.5;
  private readonly TARGET_CENTER: Vec2 = { x: 640, y: 400 };

  constructor() {
    super({ key: "PrehistoricCurling" });
  }

  create(): void {
    this.world = createWorld();
    this.gameObjects = new Map();

    // Setup input
    this.inputManager = new InputManager(this);
    this.inputManager.setup({
      launch: "SPACE",
      grow: "Z",
    });

    // Setup HUD
    this.hud = new HUD(this);
    this.hud.create();

    // Create background
    this.add.rectangle(640, 400, 1280, 800, 0x8b7355);

    // Create ice surface
    this.add.rectangle(640, 400, 800, 700, 0xb0e0e6);

    // Create target rings
    this.targetRings = [];
    const ringColors = [0xff6b6b, 0xffd93d, 0x6bcf7f];
    const ringRadii = [150, 100, 50];
    for (let i = 0; i < 3; i++) {
      const ring = this.add.circle(
        this.TARGET_CENTER.x,
        this.TARGET_CENTER.y,
        ringRadii[i],
        ringColors[i],
        0.3
      );
      ring.setStrokeStyle(3, ringColors[i]);
      this.targetRings.push(ring);

      // Create target entities for collision
      const targetEid = addEntity(this.world);
      addComponent(this.world, targetEid, Position);
      addComponent(this.world, targetEid, Target);
      Position.x[targetEid] = this.TARGET_CENTER.x;
      Position.y[targetEid] = this.TARGET_CENTER.y;
      Target.ring[targetEid] = 3 - i; // 3=center, 2=middle, 1=outer
    }

    // Create power meter
    this.powerMeterBg = this.add.rectangle(640, 750, 400, 30, 0x333333);
    this.powerMeter = this.add.rectangle(640, 750, 0, 26, 0x4ecdc4);

    // Setup observers for visual sync
    observe(
      this.world,
      onAdd(Position, Size, Color),
      (eid: number): void => {
        const circle = this.add.circle(
          Position.x[eid],
          Position.y[eid],
          Size.radius[eid],
          Color.value[eid]
        );
        circle.setStrokeStyle(2, 0xffffff);
        this.gameObjects.set(eid, circle);
      }
    );

    observe(
      this.world,
      onRemove(Position),
      (eid: number): void => {
        this.gameObjects.get(eid)?.destroy();
        this.gameObjects.delete(eid);
      }
    );

    // Instruction text
    this.instructionText = this.add.text(640, 50, "", {
      fontSize: "24px",
      color: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 10, y: 5 },
    });
    this.instructionText.setOrigin(0.5);

    // Round text
    this.roundText = this.add.text(100, 50, "Round 1/3", {
      fontSize: "28px",
      color: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 10, y: 5 },
    });

    // How to Play overlay
    this.howToPlayText = this.add.text(
      640,
      400,
      "HOW TO PLAY\n\n" +
        "Take turns sliding stones toward the target!\n" +
        "Closer to center = more points\n\n" +
        "SPACE: Charge and launch stone\n" +
        "Z: Fire growth ray to enlarge stones\n" +
        "(Growth ray has 3s cooldown)\n\n" +
        "3 rounds - highest score wins!",
      {
        fontSize: "32px",
        color: "#ffffff",
        backgroundColor: "#000000",
        padding: { x: 20, y: 20 },
        align: "center",
      }
    );
    this.howToPlayText.setOrigin(0.5);
    this.howToPlayText.setDepth(1000);

    // Assign colors to players
    const colors = [0xff6b6b, 0x4ecdc4, 0xffd93d, 0x95e1d3, 0xff9ff3];
    let colorIndex = 0;
    for (const [sessionId] of this.players) {
      this.playerColors.set(sessionId, colors[colorIndex % colors.length]);
      this.throwOrder.push(sessionId);
      colorIndex++;
    }

    this.startNewRound();
  }

  onUpdate(dt: number, players: PlayerState[]): void {
    // How to play timer
    if (this.showHowToPlay) {
      this.howToPlayTimer -= dt;
      if (this.howToPlayTimer <= 0) {
        this.showHowToPlay = false;
        this.howToPlayText.setVisible(false);
      }
      return;
    }

    // Update HUD
    this.hud.updatePlayerList(players);

    const input = this.inputManager.getState();
    const currentSessionId = this.throwOrder[this.currentThrower];

    // Update instruction text
    const currentPlayer = players.find((p) => p.sessionId === currentSessionId);
    if (currentPlayer && !this.hasLaunched) {
      this.instructionText.setText(
        `${currentPlayer.name}'s turn - Hold SPACE to charge, release to launch!`
      );
    } else if (this.roundActive) {
      this.instructionText.setText("Stones in motion...");
    } else {
      this.instructionText.setText("");
    }

    // Power charging mechanics
    if (!this.hasLaunched && !this.roundActive) {
      if (input.buttons.launch) {
        this.chargingPower = true;
        this.currentPower += this.POWER_CHARGE_RATE * this.powerDirection * dt;

        if (this.currentPower >= 1) {
          this.currentPower = 1;
          this.powerDirection = -1;
        } else if (this.currentPower <= 0) {
          this.currentPower = 0;
          this.powerDirection = 1;
        }

        this.powerMeter.width = this.currentPower * 400;
      } else if (this.chargingPower) {
        // Released - launch stone
        this.launchStone(currentSessionId, this.currentPower);
        this.chargingPower = false;
        this.hasLaunched = true;
        this.roundActive = true;
        this.powerMeter.width = 0;
        this.currentPower = 0;
        this.powerDirection = 1;
      }
    }

    // Growth ray mechanics
    if (input.buttons.grow && this.roundActive) {
      for (const rayEid of query(this.world, [GrowthRay])) {
        if (
          GrowthRay.sessionId[rayEid] === currentSessionId &&
          !GrowthRay.active[rayEid] &&
          GrowthRay.cooldown[rayEid] <= 0
        ) {
          this.fireGrowthRay(currentSessionId);
          GrowthRay.active[rayEid] = true;
          GrowthRay.cooldown[rayEid] = this.GROWTH_RAY_COOLDOWN;
        }
      }
    }

    // Update growth ray cooldowns
    for (const rayEid of query(this.world, [GrowthRay])) {
      if (GrowthRay.cooldown[rayEid] > 0) {
        GrowthRay.cooldown[rayEid] -= dt;
      }
    }

    // Physics update
    let anyMoving = false;
    for (const eid of query(this.world, [Position, Velocity, Size, Stone])) {
      if (!Stone.launched[eid]) continue;

      const vx = Velocity.dx[eid];
      const vy = Velocity.dy[eid];
      const speed = Math.sqrt(vx * vx + vy * vy);

      if (speed > this.MIN_VELOCITY) {
        anyMoving = true;

        // Apply friction
        Velocity.dx[eid] *= this.FRICTION;
        Velocity.dy[eid] *= this.FRICTION;

        // Update position
        Position.x[eid] += Velocity.dx[eid] * dt;
        Position.y[eid] += Velocity.dy[eid] * dt;

        // Boundary collision
        const radius = Size.radius[eid];
        if (Position.x[eid] - radius < 240 || Position.x[eid] + radius > 1040) {
          Velocity.dx[eid] *= -0.8;
          Position.x[eid] = Math.max(
            240 + radius,
            Math.min(1040 - radius, Position.x[eid])
          );
        }
        if (Position.y[eid] - radius < 50 || Position.y[eid] + radius > 750) {
          Velocity.dy[eid] *= -0.8;
          Position.y[eid] = Math.max(
            50 + radius,
            Math.min(750 - radius, Position.y[eid])
          );
        }
      } else {
        Velocity.dx[eid] = 0;
        Velocity.dy[eid] = 0;
      }

      // Update visual
      const obj = this.gameObjects.get(eid);
      if (obj) {
        obj.x = Position.x[eid];
        obj.y = Position.y[eid];
        obj.setRadius(Size.radius[eid]);
      }
    }

    // Check if round is complete
    if (this.roundActive && !anyMoving && this.hasLaunched) {
      this.roundActive = false;
      this.hasLaunched = false;

      // Move to next player
      this.currentThrower++;
      if (this.currentThrower >= this.throwOrder.length) {
        this.endRound();
      }
    }
  }

  private launchStone(sessionId: string, power: number): void {
    const eid = addEntity(this.world);
    addComponent(this.world, eid, Position);
    addComponent(this.world, eid, Velocity);
    addComponent(this.world, eid, Size);
    addComponent(this.world, eid, Color);
    addComponent(this.world, eid, Stone);

    // Start at bottom center
    Position.x[eid] = 640;
    Position.y[eid] = 700;

    // Launch toward target with power
    const angle = -Math.PI / 2; // Up
    const speed = power * this.MAX_POWER;
    Velocity.dx[eid] = Math.cos(angle) * speed;
    Velocity.dy[eid] = Math.sin(angle) * speed;

    Size.radius[eid] = 20;
    Color.value[eid] = this.playerColors.get(sessionId) || 0xffffff;
    Stone.sessionId[eid] = sessionId;
    Stone.launched[eid] = true;

    // Create growth ray tracker
    const rayEid = addEntity(this.world);
    addComponent(this.world, rayEid, GrowthRay);
    GrowthRay.sessionId[rayEid] = sessionId;
    GrowthRay.active[rayEid] = false;
    GrowthRay.cooldown[rayEid] = 0;
  }

  private fireGrowthRay(sessionId: string): void {
    // Find stones belonging to this player and grow them
    for (const eid of query(this.world, [Stone, Size])) {
      if (Stone.sessionId[eid] === sessionId) {
        Size.radius[eid] *= this.GROWTH_MULTIPLIER;

        // Visual effect
        const obj = this.gameObjects.get(eid);
        if (obj) {
          this.tweens.add({
            targets: obj,
            scaleX: this.GROWTH_MULTIPLIER,
            scaleY: this.GROWTH_MULTIPLIER,
            duration: 200,
            ease: "Back.easeOut",
          });
        }
      }
    }
  }

  private startNewRound(): void {
    this.currentThrower = 0;
    this.hasLaunched = false;
    this.roundActive = false;
    this.roundText.setText(`Round ${this.roundNumber}/${this.maxRounds}`);
  }

  private endRound(): void {
    // Calculate scores based on distance to center
    const scores: Map<string, number> = new Map();
    for (const sessionId of this.throwOrder) {
      scores.set(sessionId, 0);
    }

    for (const eid of query(this.world, [Position, Stone])) {
      const dx = Position.x[eid] - this.TARGET_CENTER.x;
      const dy = Position.y[eid] - this.TARGET_CENTER.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      let points = 0;
      if (distance < 50) {
        points = 3; // Center ring
      } else if (distance < 100) {
        points = 2; // Middle ring
      } else if (distance < 150) {
        points = 1; // Outer ring
      }

      const sessionId = Stone.sessionId[eid];
      scores.set(sessionId, (scores.get(sessionId) || 0) + points);
    }

    // Update player scores
    for (const [sessionId, roundScore] of scores) {
      const player = this.players.get(sessionId);
      if (player) {
        player.score = (player.score || 0) + roundScore;
      }
    }

    // Clean up stones
    for (const eid of query(this.world, [Stone])) {
      removeEntity(this.world, eid);
    }

    // Clean up growth rays
    for (const eid of query(this.world, [GrowthRay])) {
      removeEntity(this.world, eid);
    }

    // Next round or end game
    this.roundNumber++;
    if (this.roundNumber > this.maxRounds) {
      // Game over - checkWinCondition will handle this
      this.instructionText.setText("Game Over!");
    } else {
      this.startNewRound();
    }
  }

  checkWinCondition(players: PlayerState[]): string | null {
    if (this.roundNumber > this.maxRounds) {
      let maxScore = -1;
      let winner: string | null = null;

      for (const player of players) {
        const score = player.score || 0;
        if (score > maxScore) {
          maxScore = score;
          winner = player.sessionId;
        }
      }

      return winner;
    }

    return null;
  }

  onPlayerJoin(player: PlayerState): void {
    super.onPlayerJoin(player);
    // Assign color if not already assigned
    if (!this.playerColors.has(player.sessionId)) {
      const colors = [0xff6b6b, 0x4ecdc4, 0xffd93d, 0x95e1d3, 0xff9ff3];
      const colorIndex = this.throwOrder.length;
      this.playerColors.set(
        player.sessionId,
        colors[colorIndex % colors.length]
      );
      this.throwOrder.push(player.sessionId);
    }
  }
}

export function launch(
  containerId: string
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

  return {
    destroy: (): void => game.destroy(true),
  };
}