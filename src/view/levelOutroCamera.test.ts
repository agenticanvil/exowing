import { describe, expect, it } from "vitest";
import { levelOutroPose } from "./levelOutroCamera";

describe("levelOutroPose", () => {
  const railCenter = { x: 0, y: 7, z: 100 };
  const shipPosition = { x: 2, y: 4, z: 100 };
  const forward = { x: 0, y: 0, z: 1 };
  const right = { x: -1, y: 0, z: 0 };

  it("begins at the exact gameplay camera and ship pose", () => {
    const pose = levelOutroPose(
      railCenter,
      shipPosition,
      forward,
      right,
      24,
      -0.18,
      0.3,
      0,
      0,
      3.8,
    );

    expect(pose.cameraPosition).toEqual({ x: 0, y: 7, z: 76 });
    expect(pose.cameraTarget).toEqual(railCenter);
    expect(pose.shipPosition).toEqual(shipPosition);
    expect(pose.shipPitch).toBe(-0.18);
    expect(pose.shipRoll).toBe(0.3);
  });

  it("flies straight for half a second before beginning the ascent", () => {
    const coasting = levelOutroPose(
      railCenter,
      shipPosition,
      forward,
      right,
      24,
      -0.18,
      0.3,
      0.1,
      0.4,
      3.8,
    );
    const ascentStart = levelOutroPose(
      railCenter,
      shipPosition,
      forward,
      right,
      24,
      -0.18,
      0.3,
      0.13,
      0.5,
      3.8,
    );

    expect(coasting.shipPosition).toEqual(shipPosition);
    expect(coasting.shipPitch).toBeGreaterThan(-0.18);
    expect(coasting.shipRoll).toBeLessThan(0.3);
    expect(coasting.shipRoll).toBeGreaterThan(0);
    expect(ascentStart.shipPosition).toEqual(shipPosition);
    expect(ascentStart.shipPitch).toBe(0);
    expect(ascentStart.shipRoll).toBe(0);
  });

  it("matches the ship pitch to the tangent of the curved ascent", () => {
    const at = (elapsedSeconds: number) =>
      levelOutroPose(
        railCenter,
        shipPosition,
        forward,
        right,
        24,
        0,
        0,
        elapsedSeconds / 3.8,
        elapsedSeconds,
        3.8,
      );
    const climbing = at(1.8);
    const next = at(1.801);
    const movement = {
      x: next.shipPosition.x - climbing.shipPosition.x,
      y: next.shipPosition.y - climbing.shipPosition.y,
      z: next.shipPosition.z - climbing.shipPosition.z,
    };
    const tangentPitch = -Math.atan2(
      movement.y,
      Math.hypot(movement.x, movement.z),
    );

    expect(climbing.shipPosition.y).toBeGreaterThan(shipPosition.y);
    expect(climbing.shipPitch).toBeCloseTo(tangentPitch, 2);
  });

  it("leaves the camera low while the ship climbs out of frame", () => {
    const pose = levelOutroPose(
      railCenter,
      shipPosition,
      forward,
      right,
      24,
      0,
      0,
      1,
      3.8,
      3.8,
    );

    expect(pose.cameraPosition.y).toBeLessThan(railCenter.y);
    expect(pose.cameraTarget.y).toBeGreaterThan(railCenter.y);
    expect(pose.shipPosition.y).toBeGreaterThan(railCenter.y + 50);
    expect(pose.shipPitch).toBeLessThan(-1);
  });
});
