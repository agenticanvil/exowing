import { describe, expect, it } from "vitest";
import { sweptSpheresIntersect } from "./collision";

describe("sweptSpheresIntersect", () => {
  it("detects crossings between frames", () => {
    expect(
      sweptSpheresIntersect(
        { x: -5, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        1,
      ),
    ).toBe(true);
  });

  it("rejects a swept near miss", () => {
    expect(
      sweptSpheresIntersect(
        { x: -5, y: 2, z: 0 },
        { x: 5, y: 2, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        1,
      ),
    ).toBe(false);
  });
});
