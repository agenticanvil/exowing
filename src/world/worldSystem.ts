import type * as THREE from 'three';

// Shared baseline for non-obstacle ground surfaces and scenery rooted in them.
// Keep gameplay flight coordinates unchanged and move the world surface instead.
export const GROUND_SURFACE_Y = -2.5;

export type LevelEnvironment = {
  horizon: number;
  zenith: number;
  upperSky: number;
  sunset: number;
  sunDirection: readonly [number, number, number];
  sunColor: number;
  sunIntensity: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  skySunIntensity: number;
  exposure: number;
};

export type WorldStepContext = {
  railDistance: number;
  allocateId: () => number;
};

export type WorldAttachContext = {
  scene: THREE.Scene;
  environment: LevelEnvironment;
};

export type WorldRenderContext = {
  centerX: number;
  centerZ: number;
  time: number;
  world: WorldRuntime;
};

export type WaterObstacle = {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  rotation: number;
};

export interface WorldSystem {
  readonly id: string;
  step?(context: WorldStepContext): void;
  attach?(context: WorldAttachContext): void;
  render?(context: WorldRenderContext): void;
  getWaterObstacles?(): readonly WaterObstacle[];
  dispose?(): void;
}

export interface WorldSystemDefinition {
  create(): WorldSystem;
}

export class WorldRuntime {
  readonly systems: readonly WorldSystem[];
  private nextId = 1;

  constructor(definitions: readonly WorldSystemDefinition[]) {
    this.systems = definitions.map((definition) => definition.create());
  }

  step(railDistance: number) {
    const context = { railDistance, allocateId: () => this.nextId++ };
    for (const system of this.systems) system.step?.(context);
  }

  attach(scene: THREE.Scene, environment: LevelEnvironment) {
    for (const system of this.systems) system.attach?.({ scene, environment });
  }

  render(centerX: number, centerZ: number, time: number) {
    const context = { centerX, centerZ, time, world: this };
    for (const system of this.systems) system.render?.(context);
  }

  waterObstacles() {
    return this.systems.flatMap((system) => system.getWaterObstacles?.() ?? []);
  }

  get<T extends WorldSystem>(id: string) {
    return this.systems.find((system) => system.id === id) as T | undefined;
  }

  dispose() {
    for (const system of this.systems) system.dispose?.();
  }
}

export function createWorld(definitions: readonly WorldSystemDefinition[]) {
  return new WorldRuntime(definitions);
}
