import { Room, type Client } from "@colyseus/core";
import { GameState } from "../state/GameState.js";
import { RoomFactory, type GeneratedRoomLogic } from "./RoomFactory.js";
import type { GamePhase } from "@sdr/shared";

export interface GameRoomOptions {
  gameDate?: string;
  maxPlayers?: number;
}

export class GameRoom extends Room<GameState> {
  maxClients = 5;
  private gamePhase: GamePhase = "lobby";
  private logic: GeneratedRoomLogic | null = null;

  async onCreate(options: GameRoomOptions): Promise<void> {
    this.setState(new GameState());
    this.maxClients = options.maxPlayers ?? 5;

    // Load generated room logic if a game date is provided
    if (options.gameDate) {
      this.logic = await RoomFactory.loadRoom(options.gameDate);
      if (!this.logic) {
        console.warn(`No room logic found for ${options.gameDate}, using empty room`);
      }
    }

    // Forward input messages to generated logic
    this.onMessage("input", (client, data: { x: number; y: number; buttons: Record<string, boolean> }) => {
      if (this.gamePhase !== "playing" || !this.logic?.onPlayerInput) return;
      this.logic.onPlayerInput(client.sessionId, data, this.state);
    });

    // Forward action messages to generated logic
    this.onMessage("action", (client, data: { action: string; payload: unknown }) => {
      if (this.gamePhase !== "playing" || !this.logic) return;
      this.logic.onPlayerAction(client.sessionId, data.action, data.payload, this.state);
    });

    // Route unknown message types to onPlayerAction as well
    this.onMessage("*", (client, type, data) => {
      if (this.gamePhase !== "playing" || !this.logic) return;
      if (type === "input" || type === "action" || type === "ready") return;
      this.logic.onPlayerAction(client.sessionId, type as string, data, this.state);
    });

    this.onMessage("ready", (client, data: { ready: boolean }) => {
      this.state.setPlayerReady(client.sessionId, data.ready);
      this.checkAllReady();
    });

    this.setSimulationInterval((dt) => this.update(dt));

    console.log(`Room created for game: ${options.gameDate ?? "default"}`);
  }

  onJoin(client: Client, options: { name?: string }): void {
    console.log(`Player joined: ${client.sessionId}`);
    this.state.addPlayer(client.sessionId, options.name ?? "Player");

    if (this.gamePhase === "playing" && this.logic?.onPlayerJoin) {
      this.logic.onPlayerJoin(client.sessionId, this.state);
    }
  }

  onLeave(client: Client): void {
    console.log(`Player left: ${client.sessionId}`);

    if (this.gamePhase === "playing" && this.logic?.onPlayerLeave) {
      this.logic.onPlayerLeave(client.sessionId, this.state);
    }

    this.state.removePlayer(client.sessionId);
  }

  private update(dt: number): void {
    if (this.gamePhase !== "playing" || !this.logic) return;

    this.logic.onUpdate(dt, this.state);

    const winner = this.logic.checkWinCondition(this.state);
    if (winner) {
      this.gamePhase = "finished";
      this.state.phase = "finished";
      this.broadcast("game:win", { winnerId: winner });
      console.log(`Game over! Winner: ${winner}`);
    }
  }

  private checkAllReady(): void {
    if (this.gamePhase !== "lobby") return;
    const players = this.state.getPlayers();
    if (players.length >= 2 && players.every((p) => p.ready)) {
      this.startGame();
    }
  }

  private startGame(): void {
    this.gamePhase = "playing";
    this.state.phase = "playing";

    if (this.logic?.onInit) {
      this.logic.onInit(this.state);
    }

    this.broadcast("game:start", {});
    console.log("Game started!");
  }

  getGamePhase(): GamePhase {
    return this.gamePhase;
  }
}
