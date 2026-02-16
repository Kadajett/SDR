import Phaser from "phaser";
import type { GameMetadata } from "@sdr/shared";

export interface GameConfig {
  metadata: GameMetadata;
  serverUrl: string;
  playerName: string;
}

export class BaseGame {
  private phaserGame: Phaser.Game | null = null;
  private config: GameConfig;

  constructor(config: GameConfig) {
    this.config = config;
  }

  start(parent: string | HTMLElement, scenes: Phaser.Types.Scenes.SceneType[]): void {
    this.phaserGame = new Phaser.Game({
      type: Phaser.AUTO,
      width: 1280,
      height: 800,
      parent,
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scene: scenes,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: {
        gamepad: true,
      },
    });
  }

  getConfig(): GameConfig {
    return this.config;
  }

  destroy(): void {
    this.phaserGame?.destroy(true);
    this.phaserGame = null;
  }
}
