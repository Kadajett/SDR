import { Client, Room } from "colyseus.js";
import type { PlayerState } from "@sdr/shared";

export interface MultiplayerCallbacks {
  onPlayerJoin: (player: PlayerState) => void;
  onPlayerLeave: (sessionId: string) => void;
  onStateChange: (state: Record<string, unknown>) => void;
  onGameEvent: (event: string, data: unknown) => void;
  onError: (error: Error) => void;
}

export class MultiplayerClient {
  private client: Client;
  private room: Room | null = null;
  private callbacks: MultiplayerCallbacks | null = null;

  constructor(serverUrl: string) {
    this.client = new Client(serverUrl);
  }

  setCallbacks(callbacks: MultiplayerCallbacks): void {
    this.callbacks = callbacks;
  }

  async connect(roomName: string, options: Record<string, unknown> = {}): Promise<void> {
    try {
      this.room = await this.client.joinOrCreate(roomName, options);
      this.setupListeners();
    } catch (err) {
      this.callbacks?.onError(
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  private setupListeners(): void {
    if (!this.room) return;

    // Listen for player additions via schema
    this.room.state.players?.onAdd?.((player: Record<string, unknown>, sessionId: string) => {
      this.callbacks?.onPlayerJoin({
        id: sessionId,
        sessionId: sessionId,
        name: (player.name as string) ?? "Player",
        ready: (player.ready as boolean) ?? false,
        connected: (player.connected as boolean) ?? true,
        customData: {},
      });
    });

    // Listen for player removals
    this.room.state.players?.onRemove?.((_player: unknown, sessionId: string) => {
      this.callbacks?.onPlayerLeave(sessionId);
    });

    // Listen for state changes
    this.room.onStateChange((state) => {
      this.callbacks?.onStateChange(state as unknown as Record<string, unknown>);
    });

    // Listen for game events
    this.room.onMessage("game:start", (data) => {
      this.callbacks?.onGameEvent("game:start", data);
    });

    this.room.onMessage("game:event", (data) => {
      this.callbacks?.onGameEvent("game:event", data);
    });

    this.room.onMessage("game:win", (data) => {
      this.callbacks?.onGameEvent("game:win", data);
    });

    this.room.onMessage("*", (type, data) => {
      if (type === "game:start" || type === "game:event" || type === "game:win") return;
      this.callbacks?.onGameEvent(type as string, data);
    });

    this.room.onError((code, message) => {
      this.callbacks?.onError(new Error(`Room error ${code}: ${message}`));
    });
  }

  sendInput(input: { x: number; y: number; buttons: Record<string, boolean> }): void {
    this.room?.send("input", input);
  }

  sendAction(action: string, payload: unknown = {}): void {
    this.room?.send("action", { action, payload });
  }

  sendReady(ready: boolean): void {
    this.room?.send("ready", { ready });
  }

  sendMessage(type: string, data: unknown): void {
    this.room?.send(type, data);
  }

  disconnect(): void {
    this.room?.leave();
    this.room = null;
  }

  isConnected(): boolean {
    return this.room !== null;
  }

  getSessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  getRoom(): Room | null {
    return this.room;
  }
}
