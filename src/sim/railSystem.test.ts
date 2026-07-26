import { describe, expect, it } from "vitest";
import {
  railFrameAtDistance,
  SECTION_SPAN,
  TURN_ANGLE,
  TURN_LENGTH,
  TURN_START_DISTANCE,
} from "./railSystem";

describe("railSystem", () => {
  it("stays straight for the first 45 seconds", () => {
    const frame = railFrameAtDistance(TURN_START_DISTANCE);
    expect(frame.position).toEqual({ x: 0, y: 0, z: TURN_START_DISTANCE });
    expect(frame.heading).toBe(0);
  });

  it("finishes each turn on a 45-degree heading in either direction", () => {
    const frame = railFrameAtDistance(TURN_START_DISTANCE + TURN_LENGTH);
    expect(Math.abs(frame.heading)).toBeCloseTo(TURN_ANGLE);
    expect(Math.abs(frame.forward.x)).toBeCloseTo(Math.SQRT1_2);
    expect(frame.forward.z).toBeCloseTo(Math.SQRT1_2);
  });

  it("continues smoothly across many procedural sections", () => {
    for (let section = 1; section < 12; section++) {
      const boundary = section * SECTION_SPAN;
      const before = railFrameAtDistance(boundary - 0.001);
      const after = railFrameAtDistance(boundary + 0.001);
      const gap = Math.hypot(
        after.position.x - before.position.x,
        after.position.z - before.position.z,
      );
      expect(gap).toBeLessThan(0.003);
    }
  });
});
