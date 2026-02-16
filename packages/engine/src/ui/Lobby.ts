import Phaser from "phaser";
import type { PlayerState } from "@sdr/shared";

export class Lobby extends Phaser.Scene {
  private players: PlayerState[] = [];
  private playerTexts: Phaser.GameObjects.Text[] = [];
  private titleText: Phaser.GameObjects.Text | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: "Lobby" });
  }

  create(): void {
    this.titleText = this.add.text(640, 100, "Waiting for Players...", {
      fontSize: "48px",
      color: "#ffffff",
    }).setOrigin(0.5);

    this.statusText = this.add.text(640, 700, "Press A or SPACE when ready", {
      fontSize: "24px",
      color: "#aaaaaa",
    }).setOrigin(0.5);
  }

  updatePlayers(players: PlayerState[]): void {
    this.players = players;
    this.playerTexts.forEach((t) => t.destroy());
    this.playerTexts = [];

    players.forEach((player, i) => {
      const readyIcon = player.ready ? "[READY]" : "[...]";
      const text = this.add.text(640, 250 + i * 60, `${readyIcon} ${player.name}`, {
        fontSize: "32px",
        color: player.ready ? "#00ff00" : "#ffffff",
      }).setOrigin(0.5);
      this.playerTexts.push(text);
    });
  }

  allReady(): boolean {
    return this.players.length >= 2 && this.players.every((p) => p.ready);
  }

  getPlayers(): PlayerState[] {
    return this.players;
  }

  destroy(): void {
    this.titleText?.destroy();
    this.statusText?.destroy();
    this.playerTexts.forEach((t) => t.destroy());
  }
}
