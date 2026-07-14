import { EXPLOSION_SOUND_IDS, type GameAudio } from "../audio";
import { distanceSquared } from "../sim/collision";
import {
  ENEMY_MIN_PLAYER_DISTANCE,
  FLIGHT_FOG_FAR_DISTANCE,
} from "./flightDistances";
import type { FlightEvent } from "./flightEvents";

export class FlightAudioFeedback {
  constructor(
    private readonly audio?: GameAudio,
    private readonly random: () => number = Math.random,
  ) {}

  handle(event: FlightEvent): void {
    if (event.type === "player-fired") {
      this.audio?.play("player-fire", {
        volume: 0.68,
        playbackRate: randomRate(0.035),
      });
      return;
    }

    const distance = Math.sqrt(
      distanceSquared(event.position, event.listenerPosition),
    );
    const sound =
      EXPLOSION_SOUND_IDS[
        Math.floor(this.random() * EXPLOSION_SOUND_IDS.length)
      ];
    this.audio?.play(sound, { volume: explosionVolume(distance) });
  }
}

export function explosionVolume(distance: number): number {
  const distanceRange = FLIGHT_FOG_FAR_DISTANCE - ENEMY_MIN_PLAYER_DISTANCE;
  const proximity = Math.max(
    0,
    Math.min(1, (FLIGHT_FOG_FAR_DISTANCE - distance) / distanceRange),
  );
  return 0.2 + proximity * 0.8;
}

function randomRate(amount: number): number {
  return 1 + (Math.random() * 2 - 1) * amount;
}
