import { describe, expect, it } from "vitest";
import {
  AsteroidBeltSystem,
  createAsteroidGeometry,
} from "./asteroidBeltSystem";

describe("AsteroidBeltSystem", () => {
  it("streams asteroids through the full vertical cross-section", () => {
    const system = new AsteroidBeltSystem({
      rock: [0x242635, 0x4c4852, 0x765747],
      dust: 0x77d9df,
    });
    let id = 0;
    system.step({ railDistance: 0, allocateId: () => ++id });

    expect(system.features.some((feature) => feature.offsetY > 12)).toBe(true);
    expect(system.features.some((feature) => feature.offsetY < -12)).toBe(true);
    expect(
      system.features.some((feature) => Math.abs(feature.offsetX) > 15),
    ).toBe(true);
  });

  it("creates deterministic coherent cratered geometry", () => {
    const options = {
      seed: 42,
      radius: 8,
      profile: "cratered" as const,
      colors: [0x242635, 0x4c4852, 0x765747] as const,
    };
    const first = createAsteroidGeometry(options);
    const second = createAsteroidGeometry(options);

    expect(first.getAttribute("position").count).toBeGreaterThan(100);
    expect(first.getAttribute("color").count).toBe(
      first.getAttribute("position").count,
    );
    expect(Array.from(first.getAttribute("position").array)).toEqual(
      Array.from(second.getAttribute("position").array),
    );

    first.dispose();
    second.dispose();
  });
});
