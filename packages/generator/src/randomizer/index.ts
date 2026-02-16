import type { GameTopics } from "@sdr/shared";
import { SeededRandom, buildSeed } from "./seed.js";
import { SETTINGS, ACTIVITIES, TWISTS } from "./topics.js";

/**
 * Pick three topic words (setting, activity, twist) from a date seed.
 * Deterministic: same date + variant always produces the same topics.
 */
export function randomize(date: string, variant: number = 0): GameTopics {
  const seed = buildSeed(date, variant);
  const rng = new SeededRandom(seed);

  return {
    seed,
    setting: rng.pick(SETTINGS),
    activity: rng.pick(ACTIVITIES),
    twist: rng.pick(TWISTS),
  };
}

/** Format topics into a prompt-ready string */
export function topicsToPrompt(topics: GameTopics): string {
  return `${topics.setting} ${topics.activity} ${topics.twist}`;
}

export { SeededRandom, buildSeed } from "./seed.js";
export { SETTINGS, ACTIVITIES, TWISTS } from "./topics.js";
