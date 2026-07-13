import type { GameAudio } from "../audio";
import type { FlightStepResult } from "../sim/types";

export class FlightAudioFeedback {
  constructor(private readonly audio?: GameAudio) {}

  playStep(result: FlightStepResult): void {
    if (result.shotsFired > 0) {
      this.audio?.play("player-fire", {
        volume: 0.68,
        playbackRate: randomRate(0.035),
      });
    }
  }
}

function randomRate(amount: number): number {
  return 1 + (Math.random() * 2 - 1) * amount;
}
