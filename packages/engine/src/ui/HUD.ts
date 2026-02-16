import Phaser from "phaser";
import type { PlayerState } from "@sdr/shared";

export class HUD {
  private scene: Phaser.Scene;
  private scoreText: Phaser.GameObjects.Text | null = null;
  private timerText: Phaser.GameObjects.Text | null = null;
  private playerListText: Phaser.GameObjects.Text | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(): void {
    this.scoreText = this.scene.add.text(16, 16, "Score: 0", {
      fontSize: "24px",
      color: "#ffffff",
    }).setScrollFactor(0).setDepth(1000);

    this.timerText = this.scene.add.text(640, 16, "", {
      fontSize: "24px",
      color: "#ffffff",
    }).setScrollFactor(0).setDepth(1000).setOrigin(0.5, 0);

    this.playerListText = this.scene.add.text(1264, 16, "", {
      fontSize: "18px",
      color: "#ffffff",
      align: "right",
    }).setScrollFactor(0).setDepth(1000).setOrigin(1, 0);
  }

  updateScore(score: number): void {
    this.scoreText?.setText(`Score: ${score}`);
  }

  updateTimer(seconds: number): void {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    this.timerText?.setText(`${mins}:${secs.toString().padStart(2, "0")}`);
  }

  updatePlayerList(players: PlayerState[], scoreKey: string = "score"): void {
    const getScore = (p: PlayerState): number => {
      const custom = p.customData[scoreKey];
      if (typeof custom === "number") return custom;
      return p.score ?? 0;
    };

    const lines = players
      .sort((a, b) => getScore(b) - getScore(a))
      .map((p) => `${p.name}: ${getScore(p)}`)
      .join("\n");
    this.playerListText?.setText(lines);
  }

  destroy(): void {
    this.scoreText?.destroy();
    this.timerText?.destroy();
    this.playerListText?.destroy();
  }
}
