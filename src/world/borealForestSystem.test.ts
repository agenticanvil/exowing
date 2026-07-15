import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { WorldAttachContext, WorldRenderContext } from "./worldSystem";
import {
  BorealForestSystem,
  borealTerrainHeight,
  createBorealTerrainChunkGeometry,
  createEvergreenGeometry,
  createForestPatchLayout,
  type BorealForestOptions,
} from "./borealForestSystem";

const options = {
  ground: [0x344923, 0x637a35, 0x829348],
  evergreen: [0x102f2a, 0x19483b, 0x2d6045],
  granite: [0x334052, 0x586579, 0x84909e],
  water: 0x257b83,
  earth: 0x4a3424,
} as const satisfies BorealForestOptions;

describe("BorealForestSystem", () => {
  it("streams varied forest patches around a protected flight corridor", () => {
    const first = new BorealForestSystem(options);
    const second = new BorealForestSystem(options);
    let firstId = 1;
    let secondId = 1;

    first.step({ railDistance: 0, allocateId: () => firstId++ });
    second.step({ railDistance: 0, allocateId: () => secondId++ });

    expect(first.features.length).toBeGreaterThan(10);
    expect(first.features).toEqual(second.features);
    expect(first.lakes).toEqual(second.lakes);
    expect(first.lakes.length).toBeGreaterThan(0);
    expect(new Set(first.features.map((feature) => feature.style)).size).toBe(
      3,
    );
    expect(
      first.features.every((feature) => feature.offset - feature.radiusX > 15),
    ).toBe(true);
  });

  it("creates deterministic clustered trees outside the flight corridor", () => {
    const system = new BorealForestSystem(options);
    let nextId = 1;
    system.step({ railDistance: 0, allocateId: () => nextId++ });
    const feature = system.features[0];
    const first = createForestPatchLayout(feature);
    const second = createForestPatchLayout(feature);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(14);
    expect(
      new Set(
        system.features.flatMap((candidate) =>
          createForestPatchLayout(candidate).map((tree) => tree.profile),
        ),
      ).size,
    ).toBe(3);
    expect(
      first.every(
        (tree) => Math.abs(feature.side * feature.offset + tree.x) >= 15,
      ),
    ).toBe(true);
  });

  it("creates coherent vertex-colored evergreen archetypes", () => {
    const geometries = (["spruce", "fir", "pine"] as const).map((profile) =>
      createEvergreenGeometry(profile, options),
    );

    expect(
      geometries.every(
        (geometry) => geometry.getAttribute("position").count > 100,
      ),
    ).toBe(true);
    expect(
      geometries.every(
        (geometry) =>
          geometry.getAttribute("color").count ===
          geometry.getAttribute("position").count,
      ),
    ).toBe(true);
    expect(
      Array.from(geometries[0].getAttribute("position").array),
    ).not.toEqual(Array.from(geometries[1].getAttribute("position").array));
    expect(
      Array.from(geometries[0].getAttribute("position").array),
    ).not.toEqual(Array.from(geometries[2].getAttribute("position").array));

    geometries.forEach((geometry) => geometry.dispose());
  });

  it("creates deterministic rolling terrain relief", () => {
    const samples = [
      borealTerrainHeight(0, 0),
      borealTerrainHeight(41, 73),
      borealTerrainHeight(-91, 128),
    ];

    expect(new Set(samples.map((value) => value.toFixed(4))).size).toBe(3);
    expect(samples.every((value) => Number.isFinite(value))).toBe(true);
  });

  it("builds deterministic triangulated heightfield chunks", () => {
    const first = createBorealTerrainChunkGeometry(0, 0, options);
    const second = createBorealTerrainChunkGeometry(0, 0, options);
    const positions = first.getAttribute("position");
    const heights = Array.from({ length: positions.count }, (_, index) =>
      positions.getY(index),
    );

    expect(first.index).not.toBeNull();
    expect(positions.count).toBe(19 * 19);
    expect(first.index?.count).toBe(18 * 18 * 6);
    expect(first.getAttribute("color").count).toBe(positions.count);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(5);
    expect(Array.from(positions.array)).toEqual(
      Array.from(second.getAttribute("position").array),
    );

    first.dispose();
    second.dispose();
  });

  it("keeps neighboring heightfield chunk borders identical", () => {
    const left = createBorealTerrainChunkGeometry(0, 0, options);
    const right = createBorealTerrainChunkGeometry(1, 0, options);
    const leftPositions = left.getAttribute("position");
    const rightPositions = right.getAttribute("position");
    const leftColors = left.getAttribute("color");
    const rightColors = right.getAttribute("color");

    for (let row = 0; row < 19; row++) {
      const leftIndex = row * 19 + 18;
      const rightIndex = row * 19;
      expect(leftPositions.getY(leftIndex)).toBe(
        rightPositions.getY(rightIndex),
      );
      expect(leftColors.getX(leftIndex)).toBe(rightColors.getX(rightIndex));
      expect(leftColors.getY(leftIndex)).toBe(rightColors.getY(rightIndex));
      expect(leftColors.getZ(leftIndex)).toBe(rightColors.getZ(rightIndex));
    }

    left.dispose();
    right.dispose();
  });

  it("never rewrites existing terrain chunks while streaming", () => {
    const system = new BorealForestSystem(options);
    const scene = new THREE.Scene();
    system.attach({ scene } as WorldAttachContext);
    const original = scene.children.find(
      (child) =>
        child instanceof THREE.Mesh &&
        child.position.x === 0 &&
        child.position.z === 0,
    ) as THREE.Mesh;
    const originalPositions = Array.from(
      original.geometry.getAttribute("position").array,
    );

    system.render({ centerX: 140, centerZ: 0 } as WorldRenderContext);

    expect(scene.children).toContain(original);
    expect(
      Array.from(original.geometry.getAttribute("position").array),
    ).toEqual(originalPositions);
    system.dispose();
  });
});
