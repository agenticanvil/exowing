import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAMEPLAY_CAMERA_FOV,
  levelIntroCameraPose,
} from "./levelIntroCamera";

describe("levelIntroCameraPose", () => {
  const railCenter = { x: 4, y: 7, z: 10 };
  const shipPosition = { x: 4, y: 4, z: 10 };
  const forward = { x: 0, y: 0, z: 1 };
  const right = { x: -1, y: 0, z: 0 };

  it("opens ahead and to the side of the player", () => {
    const pose = levelIntroCameraPose(
      railCenter,
      shipPosition,
      forward,
      right,
      24,
      0,
    );

    expect(pose.position.x).toBeLessThan(railCenter.x);
    expect(pose.position.y).toBeGreaterThan(railCenter.y);
    expect(pose.position.z).toBeGreaterThan(railCenter.z);
    expect(pose.fov).toBe(50);
  });

  it("ends exactly at the default gameplay camera pose", () => {
    const pose = levelIntroCameraPose(
      railCenter,
      shipPosition,
      forward,
      right,
      24,
      1,
    );

    expect(pose.position).toEqual({ x: 4, y: 7, z: -14 });
    expect(pose.target).toEqual(railCenter);
    expect(pose.fov).toBe(DEFAULT_GAMEPLAY_CAMERA_FOV);
    expect(pose.roll).toBeCloseTo(0);
  });

  it("clamps progress to the animation endpoints", () => {
    const before = levelIntroCameraPose(
      railCenter,
      shipPosition,
      forward,
      right,
      24,
      -1,
    );
    const start = levelIntroCameraPose(
      railCenter,
      shipPosition,
      forward,
      right,
      24,
      0,
    );
    const after = levelIntroCameraPose(
      railCenter,
      shipPosition,
      forward,
      right,
      24,
      2,
    );
    const end = levelIntroCameraPose(
      railCenter,
      shipPosition,
      forward,
      right,
      24,
      1,
    );

    expect(before).toEqual(start);
    expect(after).toEqual(end);
  });
});
