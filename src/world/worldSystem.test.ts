import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  createWorld,
  type LevelEnvironment,
  type WorldSystemDefinition,
} from "./worldSystem";
import { oceanSurface } from "./waterSystem";
import { desertCanyon } from "./desertCanyonSystem";

describe("WorldRuntime", () => {
  it("runs arbitrary composed systems without knowing their concrete types", () => {
    const firstStep = vi.fn();
    const secondStep = vi.fn();
    const definitions: WorldSystemDefinition[] = [
      { create: () => ({ id: "terrain", step: firstStep }) },
      { create: () => ({ id: "particles", step: secondStep }) },
    ];
    const world = createWorld(definitions);

    world.step(125);

    expect(firstStep).toHaveBeenCalledWith(
      expect.objectContaining({ railDistance: 125 }),
    );
    expect(secondStep).toHaveBeenCalledWith(
      expect.objectContaining({ railDistance: 125 }),
    );
  });

  it("detects projectile segments crossing rendered level geometry", () => {
    const obstacle = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial(),
    );
    obstacle.position.set(0, 2, 5);
    const distantObstacle = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial(),
    );
    distantObstacle.position.set(100, 2, 5);
    const obstacleRaycast = vi.spyOn(obstacle, "raycast");
    const distantRaycast = vi.spyOn(distantObstacle, "raycast");
    const world = createWorld([
      {
        create: () => ({
          id: "obstacle",
          getCollidableObjects: () => [obstacle, distantObstacle],
        }),
      },
    ]);
    world.render(0, 0, 0);

    expect(world.getCollidableObjects()).toEqual([obstacle, distantObstacle]);

    expect(
      world.projectileCollides({ x: 3, y: 2, z: 0 }, { x: 3, y: 2, z: 10 }),
    ).toBe(false);
    expect(obstacleRaycast).not.toHaveBeenCalled();
    expect(distantRaycast).not.toHaveBeenCalled();
    expect(
      world.projectileCollides({ x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 10 }),
    ).toBe(true);
    expect(obstacleRaycast).toHaveBeenCalledOnce();
    expect(distantRaycast).not.toHaveBeenCalled();

    obstacleRaycast.mockClear();
    expect(
      world.lineOfFireBlocked({ x: 0, y: 2, z: 0 }, { x: 0, y: 2, z: 10 }),
    ).toBe(true);
    expect(
      world.lineOfFireBlocked({ x: 3, y: 2, z: 0 }, { x: 3, y: 2, z: 10 }),
    ).toBe(false);
    expect(obstacleRaycast).not.toHaveBeenCalled();
    expect(distantRaycast).not.toHaveBeenCalled();

    obstacle.geometry.dispose();
    obstacle.material.dispose();
    distantObstacle.geometry.dispose();
    distantObstacle.material.dispose();
  });

  it("does not expose water as collidable level geometry", () => {
    const world = createWorld([
      oceanSurface({
        deep: 0x061b2e,
        face: 0x126b82,
        horizon: 0x60d8de,
        foam: 0xd7ffff,
      }),
    ]);

    world.render(0, 0, 0);

    expect(world.getCollidableObjects()).toEqual([]);
  });

  it("does not expose a level ground plane as collidable geometry", () => {
    const scene = new THREE.Scene();
    const world = createWorld([
      desertCanyon({
        sand: 0xc9823f,
        rock: [0x9a4027, 0xc45f31, 0xe18443],
      }),
    ]);
    world.attach(scene, {} as LevelEnvironment);
    world.step(0);
    world.render(0, 0, 0);
    const ground = scene.children.find(
      (object) => object instanceof THREE.Mesh,
    );

    expect(ground).toBeDefined();
    expect(world.getCollidableObjects().length).toBeGreaterThan(0);
    expect(world.getCollidableObjects()).not.toContain(ground);

    world.dispose();
  });
});
