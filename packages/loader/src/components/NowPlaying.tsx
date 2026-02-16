import { onMount, onCleanup, createSignal } from "solid-js";
import type { GameMetadata } from "@sdr/shared";

interface GameHandle {
  destroy: () => void;
}

interface NowPlayingProps {
  game: GameMetadata;
  onExit: () => void;
}

export default function NowPlaying(props: NowPlayingProps) {
  const [status, setStatus] = createSignal<"loading" | "playing" | "error">("loading");
  const [errorMsg, setErrorMsg] = createSignal("");
  let gameHandle: GameHandle | null = null;

  onMount(async () => {
    try {
      const moduleUrl = `/games/${props.game.date}/client/game.js`;
      console.log("[NowPlaying] Loading game module:", moduleUrl);
      const mod = await import(/* @vite-ignore */ moduleUrl);
      console.log("[NowPlaying] Module loaded, exports:", Object.keys(mod));

      if (typeof mod.launch !== "function") {
        throw new Error("Game module missing launch() function");
      }

      console.log("[NowPlaying] Calling launch('game-container')");
      gameHandle = mod.launch("game-container") as GameHandle;
      console.log("[NowPlaying] Game launched successfully");
      setStatus("playing");
    } catch (err) {
      console.error("[NowPlaying] Failed to load game:", err);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  });

  onCleanup(() => {
    if (gameHandle) {
      gameHandle.destroy();
      gameHandle = null;
    }
  });

  return (
    <div>
      <div>
        <h2>{props.game.title}</h2>
        <button onClick={() => props.onExit()}>Exit Game</button>
      </div>
      {status() === "loading" && <p>Loading game...</p>}
      {status() === "error" && (
        <div>
          <p>Failed to load game</p>
          <p>{errorMsg()}</p>
        </div>
      )}
      {props.game.howToPlay && (
        <p>{props.game.howToPlay}</p>
      )}
      <div
        id="game-container"
        style={{ width: "1280px", height: "800px", margin: "0 auto", background: "#222" }}
      >
        {/* Phaser game canvas mounts here via game's launch() */}
      </div>
    </div>
  );
}
