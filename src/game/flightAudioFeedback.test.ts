import { describe, expect, it, vi } from "vitest";
import type { GameAudio } from "../audio";
import type { FlightStepResult } from "../sim/types";
import { FlightAudioFeedback } from "./flightAudioFeedback";

function stepResult(shotsFired: number): FlightStepResult {
  return {
    shotsFired,
    enemyHits: 0,
    kills: 0,
    scoreDelta: 0,
    playerHits: 0,
    bossDefeated: false,
  };
}

describe("FlightAudioFeedback", () => {
  it("plays player fire once when a simulation step fires", () => {
    const play = vi.fn();
    const audio = { play } as unknown as GameAudio;
    const feedback = new FlightAudioFeedback(audio);

    feedback.playStep(stepResult(1));

    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith(
      "player-fire",
      expect.objectContaining({ volume: 0.68 }),
    );
  });

  it("stays silent when no shot was fired", () => {
    const play = vi.fn();
    const audio = { play } as unknown as GameAudio;
    const feedback = new FlightAudioFeedback(audio);

    feedback.playStep(stepResult(0));

    expect(play).not.toHaveBeenCalled();
  });
});
