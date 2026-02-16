import type { GameMetadata } from "@sdr/shared";

interface GameCardProps {
  game: GameMetadata;
  onSelect: () => void;
}

export default function GameCard(props: GameCardProps) {
  return (
    <div onClick={() => props.onSelect()}>
      <h3>{props.game.title}</h3>
      <p>{props.game.description}</p>
      <div>
        <span>{props.game.playerCount.min}-{props.game.playerCount.max} players</span>
        <span>{props.game.date}</span>
      </div>
    </div>
  );
}
