import Phaser from "phaser";

declare module "phaser3-rex-plugins/plugins/virtualjoystick.js" {
  interface VirtualJoystickConfig {
    x?: number;
    y?: number;
    radius?: number;
    base?: Phaser.GameObjects.GameObject;
    thumb?: Phaser.GameObjects.GameObject;
    /** When true, joystick is fixed to screen (not affected by camera scroll) */
    fixed?: boolean;
    /** Direction constraint: '8dir' | 'up&down' | 'left&right' | 'none' */
    dir?: string | number;
    /** Minimum force (0.0–1.0) before forceX/Y are non-zero */
    forceMin?: number;
  }

  class VirtualJoystick {
    constructor(scene: Phaser.Scene, config: VirtualJoystickConfig);
    /** Horizontal force: -1.0 (left) to 1.0 (right) */
    forceX: number;
    /** Vertical force: -1.0 (up) to 1.0 (down) */
    forceY: number;
    /** Total force magnitude: 0.0 to 1.0 */
    force: number;
    /** Whether any force is being applied */
    noKey: boolean;
    destroy(): void;
  }

  export default VirtualJoystick;
}
