import Phaser from "phaser";
import VirtualJoystick from "phaser3-rex-plugins/plugins/virtualjoystick.js";

/**
 * Unified input state returned by InputManager.getState().
 * Works across all input methods: gamepad (Steam Deck), keyboard, and mobile touch.
 *
 * Axes:
 *   - moveX/moveY: primary movement (-1 to 1). Left stick / WASD / touch joystick.
 *   - aimX/aimY:   aim or look direction (-1 to 1). Right stick only (mouse aim TBD).
 *
 * Buttons (boolean):
 *   - action1: A / Space / touch-A  — primary action (jump, confirm, collect)
 *   - action2: B / Shift / touch-B  — secondary action (dodge, cancel, back)
 *   - action3: X / E                — tertiary action (interact, use item)
 *   - action4: Y / Q                — quaternary action (special, inventory)
 *   - bumperLeft:  LB / Tab         — cycle left, previous
 *   - bumperRight: RB / R           — cycle right, next
 *   - pause:       Start / Escape   — pause menu
 *
 * Triggers (analog 0.0–1.0):
 *   - triggerLeft:  LT  — aim, brake
 *   - triggerRight: RT  — shoot, accelerate
 *
 * Meta:
 *   - lastDevice: which input method was most recently active
 */
export interface InputState {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  action1: boolean;
  action2: boolean;
  action3: boolean;
  action4: boolean;
  bumperLeft: boolean;
  bumperRight: boolean;
  triggerLeft: number;
  triggerRight: number;
  pause: boolean;
  lastDevice: "keyboard" | "gamepad" | "touch";
}

const DEADZONE = 0.15;
const TOUCH_ZONE_DEPTH = 5000;

export class InputManager {
  private scene: Phaser.Scene;
  private gamepad: Phaser.Input.Gamepad.Gamepad | null = null;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private keys: Partial<Record<string, Phaser.Input.Keyboard.Key>> = {};

  // Touch controls
  private joystick: VirtualJoystick | null = null;
  private touchButtons = {
    action1: false,
    action2: false,
  };

  private _lastDevice: "keyboard" | "gamepad" | "touch" = "keyboard";

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Call once from create(). Sets up all input sources.
   * On touch devices, creates an on-screen virtual joystick and action buttons.
   */
  setup(): void {
    this.setupKeyboard();
    this.setupGamepad();

    if (this.scene.sys.game.device.input.touch) {
      this.setupTouchControls();
    }
  }

  private setupKeyboard(): void {
    const kb = this.scene.input.keyboard;
    if (!kb) return;

    this.cursors = kb.createCursorKeys();

    const keyDefs: Record<string, string> = {
      w: "W", a: "A", s: "S", d: "D",
      space: "SPACE", shift: "SHIFT",
      e: "E", q: "Q", r: "R",
      tab: "TAB", esc: "ESC",
    };

    for (const [name, code] of Object.entries(keyDefs)) {
      this.keys[name] = kb.addKey(code);
    }
  }

  private setupGamepad(): void {
    const gpm = this.scene.input.gamepad;
    if (!gpm) return;

    // Check for already-connected pad
    if (gpm.total > 0) {
      this.gamepad = gpm.getPad(0);
    }

    // Handle new connections (including reconnects)
    gpm.on("connected", (pad: Phaser.Input.Gamepad.Gamepad) => {
      this.gamepad = pad;
    });

    // Handle disconnects — try to fall back to another pad
    gpm.on("disconnected", () => {
      this.gamepad = gpm.total > 0 ? gpm.getPad(0) : null;
    });
  }

  private setupTouchControls(): void {
    const scene = this.scene;

    // Virtual joystick: lower-left corner, fixed to screen
    const base = scene.add
      .circle(0, 0, 80, 0x888888, 0.35)
      .setScrollFactor(0)
      .setDepth(TOUCH_ZONE_DEPTH);

    const thumb = scene.add
      .circle(0, 0, 40, 0xdddddd, 0.75)
      .setScrollFactor(0)
      .setDepth(TOUCH_ZONE_DEPTH + 1);

    this.joystick = new VirtualJoystick(scene, {
      x: 160,
      y: 650,
      radius: 80,
      base,
      thumb,
      fixed: true,
    });

    // Action button A (primary) — lower-right
    const btnAX = 1120;
    const btnAY = 700;
    const btnA = scene.add
      .circle(btnAX, btnAY, 50, 0x22cc55, 0.65)
      .setScrollFactor(0)
      .setDepth(TOUCH_ZONE_DEPTH)
      .setInteractive();
    scene.add
      .text(btnAX, btnAY, "A", { fontSize: "30px", color: "#ffffff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(TOUCH_ZONE_DEPTH + 1);

    // Action button B (secondary) — upper-right of A
    const btnBX = 1210;
    const btnBY = 630;
    const btnB = scene.add
      .circle(btnBX, btnBY, 50, 0xcc3333, 0.65)
      .setScrollFactor(0)
      .setDepth(TOUCH_ZONE_DEPTH)
      .setInteractive();
    scene.add
      .text(btnBX, btnBY, "B", { fontSize: "30px", color: "#ffffff", fontStyle: "bold" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(TOUCH_ZONE_DEPTH + 1);

    // Track each button independently (handles multi-touch correctly)
    const pressBtn = (btn: keyof typeof this.touchButtons) => {
      this._lastDevice = "touch";
      this.touchButtons[btn] = true;
    };
    const releaseBtn = (btn: keyof typeof this.touchButtons) => {
      this.touchButtons[btn] = false;
    };

    btnA.on("pointerdown", () => pressBtn("action1"));
    btnA.on("pointerup", () => releaseBtn("action1"));
    btnA.on("pointerout", () => releaseBtn("action1"));

    btnB.on("pointerdown", () => pressBtn("action2"));
    btnB.on("pointerup", () => releaseBtn("action2"));
    btnB.on("pointerout", () => releaseBtn("action2"));
  }

  /**
   * Returns the current unified input state.
   * Safe to call every frame from onUpdate().
   */
  getState(): InputState {
    const state: InputState = {
      moveX: 0, moveY: 0,
      aimX: 0, aimY: 0,
      action1: false, action2: false,
      action3: false, action4: false,
      bumperLeft: false, bumperRight: false,
      triggerLeft: 0, triggerRight: 0,
      pause: false,
      lastDevice: this._lastDevice,
    };

    this.applyGamepad(state);
    this.applyKeyboard(state);
    this.applyTouch(state);

    state.lastDevice = this._lastDevice;
    return state;
  }

  private applyGamepad(state: InputState): void {
    const pad = this.gamepad;
    if (!pad?.connected) return;

    const lx = pad.leftStick.x;
    const ly = pad.leftStick.y;
    const rx = pad.rightStick.x;
    const ry = pad.rightStick.y;

    const gpActive =
      Math.abs(lx) > DEADZONE || Math.abs(ly) > DEADZONE ||
      Math.abs(rx) > DEADZONE || Math.abs(ry) > DEADZONE ||
      pad.A || pad.B || pad.X || pad.Y ||
      pad.L1 || pad.R1 || pad.L2 > DEADZONE || pad.R2 > DEADZONE;

    if (gpActive) this._lastDevice = "gamepad";

    state.moveX = Math.abs(lx) > DEADZONE ? lx : 0;
    state.moveY = Math.abs(ly) > DEADZONE ? ly : 0;
    state.aimX = Math.abs(rx) > DEADZONE ? rx : 0;
    state.aimY = Math.abs(ry) > DEADZONE ? ry : 0;

    state.action1 = pad.A;
    state.action2 = pad.B;
    state.action3 = pad.X;
    state.action4 = pad.Y;
    state.bumperLeft = !!pad.L1;
    state.bumperRight = !!pad.R1;
    state.triggerLeft = pad.L2;
    state.triggerRight = pad.R2;
    state.pause = pad.isButtonDown(9); // Menu / Start
  }

  private applyKeyboard(state: InputState): void {
    const c = this.cursors;
    const k = this.keys;

    const moveLeft = k.a?.isDown || c?.left?.isDown;
    const moveRight = k.d?.isDown || c?.right?.isDown;
    const moveUp = k.w?.isDown || c?.up?.isDown;
    const moveDown = k.s?.isDown || c?.down?.isDown;
    const anyKey =
      moveLeft || moveRight || moveUp || moveDown ||
      k.space?.isDown || k.shift?.isDown ||
      k.e?.isDown || k.q?.isDown || k.r?.isDown ||
      k.tab?.isDown || k.esc?.isDown;

    if (anyKey) this._lastDevice = "keyboard";

    if (moveLeft) state.moveX = -1;
    if (moveRight) state.moveX = 1;
    if (moveUp) state.moveY = -1;
    if (moveDown) state.moveY = 1;

    if (k.space?.isDown) state.action1 = true;
    if (k.shift?.isDown) state.action2 = true;
    if (k.e?.isDown) state.action3 = true;
    if (k.q?.isDown) state.action4 = true;
    if (k.tab?.isDown) state.bumperLeft = true;
    if (k.r?.isDown) state.bumperRight = true;
    if (k.esc?.isDown) state.pause = true;
  }

  private applyTouch(state: InputState): void {
    if (!this.joystick) return;

    const jx = this.joystick.forceX;
    const jy = this.joystick.forceY;

    if (Math.abs(jx) > DEADZONE || Math.abs(jy) > DEADZONE) {
      this._lastDevice = "touch";
      // Touch joystick overrides keyboard axes for movement
      state.moveX = jx;
      state.moveY = jy;
    }

    if (this.touchButtons.action1) state.action1 = true;
    if (this.touchButtons.action2) state.action2 = true;
  }

  /** Returns the raw gamepad object, or null if not connected. */
  getGamepad(): Phaser.Input.Gamepad.Gamepad | null {
    return this.gamepad;
  }

  /** Clean up virtual joystick when scene shuts down. */
  destroy(): void {
    this.joystick?.destroy();
    this.joystick = null;
  }
}
