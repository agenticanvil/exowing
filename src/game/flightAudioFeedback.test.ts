import { describe, expect, it, vi } from "vitest";
import type { GameAudio } from "../audio";
import { explosionVolume, FlightAudioFeedback } from "./flightAudioFeedback";

describe("FlightAudioFeedback", () => {
  it("plays player fire once when a simulation step fires", () => {
    const play = vi.fn();
    const audio = { play } as unknown as GameAudio;
    const feedback = new FlightAudioFeedback(audio);

    feedback.handle({ type: "player-fired" });

    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith(
      "player-fire",
      expect.objectContaining({ volume: 0.68 }),
    );
  });

  it("randomly selects an explosion sound for every enemy explosion", () => {
    const play = vi.fn();
    const audio = { play } as unknown as GameAudio;
    const feedback = new FlightAudioFeedback(audio, () => 0.5);

    feedback.handle({
      type: "enemy-exploded",
      position: { x: 0, y: 0, z: 45 },
      listenerPosition: { x: 0, y: 0, z: 0 },
    });

    expect(play).toHaveBeenCalledWith("explosion-2", {
      volume: explosionVolume(45),
    });
  });

  it("makes nearby explosions louder than distant explosions", () => {
    expect(explosionVolume(10)).toBeGreaterThan(explosionVolume(100));
    expect(explosionVolume(18)).toBe(1);
    expect(explosionVolume(190)).toBeCloseTo(0.2);
    expect(explosionVolume(250)).toBeCloseTo(0.2);
  });
});
