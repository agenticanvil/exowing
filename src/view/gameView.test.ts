import { describe, expect, it } from "vitest";
import { FLIGHT_WINDOW } from "../sim/flightSimulation";
import { playerPitch } from "./gameView";

describe("playerPitch", () => {
  it("points the nose in the direction of vertical movement", () => {
    expect(playerPitch(6, 12)).toBeLessThan(0);
    expect(playerPitch(6, -12)).toBeGreaterThan(0);
  });

  it("eases the rendered plane level near the edge it is approaching", () => {
    expect(Math.abs(playerPitch(FLIGHT_WINDOW.maxY - 0.5, 12))).toBeLessThan(
      Math.abs(playerPitch(FLIGHT_WINDOW.maxY - 1.5, 12)),
    );
    expect(playerPitch(FLIGHT_WINDOW.maxY, 12)).toBe(0);

    expect(Math.abs(playerPitch(FLIGHT_WINDOW.minY + 0.5, -12))).toBeLessThan(
      Math.abs(playerPitch(FLIGHT_WINDOW.minY + 1.5, -12)),
    );
    expect(playerPitch(FLIGHT_WINDOW.minY, -12)).toBe(0);
  });

  it("does not level off near the edge behind its movement direction", () => {
    expect(playerPitch(FLIGHT_WINDOW.minY, 12)).toBeCloseTo(-0.192);
    expect(playerPitch(FLIGHT_WINDOW.maxY, -12)).toBeCloseTo(0.192);
  });
});
