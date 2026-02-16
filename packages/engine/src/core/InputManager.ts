import Phaser from "phaser";

export interface InputState {
  x: number;
  y: number;
  buttons: Record<string, boolean>;
}

export class InputManager {
  private scene: Phaser.Scene;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private gamepad: Phaser.Input.Gamepad.Gamepad | null = null;

  private buttonMap: Record<string, Phaser.Input.Keyboard.Key | null> = {};

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setup(buttons: Record<string, string> = {}): void {
    if (this.scene.input.keyboard) {
      this.cursors = this.scene.input.keyboard.createCursorKeys();

      for (const [name, keyCode] of Object.entries(buttons)) {
        this.buttonMap[name] = this.scene.input.keyboard.addKey(keyCode);
      }
    }

    if (this.scene.input.gamepad) {
      this.scene.input.gamepad.once("connected", (pad: Phaser.Input.Gamepad.Gamepad) => {
        this.gamepad = pad;
      });

      if (this.scene.input.gamepad.total > 0) {
        this.gamepad = this.scene.input.gamepad.getPad(0);
      }
    }
  }

  getState(): InputState {
    const state: InputState = { x: 0, y: 0, buttons: {} };

    if (this.gamepad) {
      state.x = this.gamepad.leftStick.x;
      state.y = this.gamepad.leftStick.y;

      state.buttons["a"] = this.gamepad.A;
      state.buttons["b"] = this.gamepad.B;
      state.buttons["x"] = this.gamepad.X;
      state.buttons["y"] = this.gamepad.Y;
    }

    if (this.cursors) {
      if (this.cursors.left.isDown) state.x = -1;
      if (this.cursors.right.isDown) state.x = 1;
      if (this.cursors.up.isDown) state.y = -1;
      if (this.cursors.down.isDown) state.y = 1;
    }

    for (const [name, key] of Object.entries(this.buttonMap)) {
      if (key) {
        state.buttons[name] = key.isDown;
      }
    }

    return state;
  }

  getGamepad(): Phaser.Input.Gamepad.Gamepad | null {
    return this.gamepad;
  }
}
