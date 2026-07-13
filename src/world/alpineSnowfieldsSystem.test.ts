import { describe, expect, it } from "vitest";
import {
  AlpineSnowfieldsSystem,
  createAlpineGeometry,
  snowCoverageForSlope,
  snowfieldHeight,
} from "./alpineSnowfieldsSystem";

const options = {
  snow: [0xf7fbff, 0xdbe9f4, 0xa9c2d8] as const,
  rock: [0x253448, 0x42556c, 0x687d91] as const,
  ice: 0x55bad2,
  evergreen: 0x173f45,
};

describe("AlpineSnowfieldsSystem", () => {
  it("streams varied formations on both sides of a clear flight corridor", () => {
    const system = new AlpineSnowfieldsSystem(options);
    let nextId = 1;

    system.step({ railDistance: 0, allocateId: () => nextId++ });

    expect(system.features.length).toBeGreaterThan(12);
    expect(system.features.some((feature) => feature.side === -1)).toBe(true);
    expect(system.features.some((feature) => feature.side === 1)).toBe(true);
    expect(system.features.every((feature) => feature.offset > 28)).toBe(true);
    expect(
      new Set(system.features.map((feature) => feature.profile)).size,
    ).toBeGreaterThan(2);
    expect(system.lakes.length).toBeGreaterThan(0);
    expect(system.lakes.every((lake) => Math.abs(lake.offset) < 18)).toBe(true);
    expect(system.features.some((feature) => feature.trees > 0)).toBe(true);
  });

  it("creates deterministic coherent terrain with slope-driven surface colors", () => {
    const geometryOptions = {
      seed: 42,
      width: 22,
      height: 28,
      depth: 24,
      profile: "horn" as const,
      snow: options.snow,
      rock: options.rock,
    };
    const first = createAlpineGeometry(geometryOptions);
    const second = createAlpineGeometry(geometryOptions);

    expect(first.index).toBeNull();
    expect(first.getAttribute("position").count).toBeGreaterThan(500);
    expect(first.getAttribute("color").count).toBe(
      first.getAttribute("position").count,
    );
    expect(
      new Set(Array.from(first.getAttribute("color").array)).size,
    ).toBeGreaterThan(6);
    expect(Array.from(first.getAttribute("position").array)).toEqual(
      Array.from(second.getAttribute("position").array),
    );
    expect(Array.from(first.getAttribute("color").array)).toEqual(
      Array.from(second.getAttribute("color").array),
    );

    first.dispose();
    second.dispose();
  });

  it("puts substantially more snow on flatter surfaces", () => {
    const flat = snowCoverageForSlope(0.94, 0.5, 0.5);
    const steep = snowCoverageForSlope(0.18, 0.5, 0.5);

    expect(flat).toBeGreaterThan(0.9);
    expect(steep).toBeLessThan(0.1);
  });

  it("creates deterministic relief across the continuous valley floor", () => {
    const samples = [
      snowfieldHeight(0, 0),
      snowfieldHeight(31, 47),
      snowfieldHeight(-82, 113),
    ];

    expect(new Set(samples.map((value) => value.toFixed(4))).size).toBe(3);
    expect(samples.every((value) => Number.isFinite(value))).toBe(true);
  });
});
