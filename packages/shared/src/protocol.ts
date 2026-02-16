export const enum MessageType {
  PLAYER_INPUT = "player_input",
  PLAYER_ACTION = "player_action",
  GAME_EVENT = "game_event",
  GAME_WIN = "game_win",
  CHAT = "chat",
  READY = "ready",
  START_GAME = "start_game",
}

export interface PlayerInputMessage {
  type: MessageType.PLAYER_INPUT;
  input: {
    x: number;
    y: number;
    buttons: Record<string, boolean>;
  };
}

export interface GameEventMessage {
  type: MessageType.GAME_EVENT;
  event: string;
  data: Record<string, unknown>;
}

export interface ChatMessage {
  type: MessageType.CHAT;
  text: string;
}

export interface ReadyMessage {
  type: MessageType.READY;
  ready: boolean;
}

export interface PlayerActionMessage {
  type: MessageType.PLAYER_ACTION;
  action: string;
  payload: unknown;
}

export type ClientMessage =
  | PlayerInputMessage
  | PlayerActionMessage
  | GameEventMessage
  | ChatMessage
  | ReadyMessage;
