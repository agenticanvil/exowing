import * as THREE from "three";
import type { Vec3 } from "../sim/types";
import { performanceRecorder } from "../performance";

// Shared baseline for non-obstacle ground surfaces and scenery rooted in them.
// Keep gameplay flight coordinates unchanged and move the world surface instead.
export const GROUND_SURFACE_Y = -2.5;

const COLLISION_CELL_SIZE = 32;
const MAX_INDEX_CELLS_PER_OBJECT = 64;
const MAX_QUERY_CELLS = 128;

export type LevelEnvironment = {
  atmosphere: boolean;
  wispyClouds: boolean;
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
  enemyFillIntensity?: number;
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
  getCollidableObjects?(): readonly THREE.Object3D[];
  getWaterObstacles?(): readonly WaterObstacle[];
  dispose?(): void;
}

export interface WorldSystemDefinition {
  create(): WorldSystem;
}

export class WorldRuntime {
  readonly systems: readonly WorldSystem[];
  private nextId = 1;
  private readonly collisionRaycaster = new THREE.Raycaster();
  private readonly collisionOrigin = new THREE.Vector3();
  private readonly collisionDirection = new THREE.Vector3();
  private readonly collisionIntersection = new THREE.Vector3();
  private readonly segmentBounds = new THREE.Box3();
  private readonly collidableObjects: THREE.Object3D[] = [];
  private readonly collidableBounds = new Map<THREE.Object3D, THREE.Box3>();
  private readonly collidableGrid = new Map<string, THREE.Object3D[]>();
  private readonly overflowCollidables: THREE.Object3D[] = [];
  private readonly collisionCandidates: THREE.Object3D[] = [];
  private readonly seenCollisionCandidates = new Set<THREE.Object3D>();

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
    this.refreshCollidableObjects();
  }

  waterObstacles() {
    return this.systems.flatMap((system) => system.getWaterObstacles?.() ?? []);
  }

  projectileCollides(start: Vec3, end: Vec3) {
    return performanceRecorder.span("collision.world", () =>
      this.projectileCollidesUnmeasured(start, end),
    );
  }

  lineOfFireBlocked(start: Vec3, end: Vec3) {
    return performanceRecorder.span("collision.enemyBroadPhase", () => {
      const distance = this.prepareSegment(start, end);
      if (distance === 0) return false;
      for (const object of this.getCollisionCandidates()) {
        const bounds = this.collidableBounds.get(object);
        if (
          bounds &&
          this.segmentBounds.intersectsBox(bounds) &&
          this.segmentIntersectsBounds(bounds, distance)
        )
          return true;
      }
      return false;
    });
  }

  getCollidableObjects() {
    return this.collidableObjects;
  }

  private projectileCollidesUnmeasured(start: Vec3, end: Vec3) {
    const distance = this.prepareSegment(start, end);
    if (distance === 0) return false;
    for (const object of this.getCollisionCandidates()) {
      const bounds = this.collidableBounds.get(object);
      if (
        !bounds ||
        !this.segmentBounds.intersectsBox(bounds) ||
        !this.segmentIntersectsBounds(bounds, distance)
      )
        continue;
      if (this.collisionRaycaster.intersectObject(object, true).length > 0)
        return true;
    }
    return false;
  }

  private prepareSegment(start: Vec3, end: Vec3) {
    this.collisionOrigin.set(start.x, start.y, start.z);
    this.collisionDirection.set(
      end.x - start.x,
      end.y - start.y,
      end.z - start.z,
    );
    const distance = this.collisionDirection.length();
    if (distance === 0) return 0;
    this.collisionDirection.multiplyScalar(1 / distance);
    this.collisionRaycaster.set(this.collisionOrigin, this.collisionDirection);
    this.collisionRaycaster.near = 0;
    this.collisionRaycaster.far = distance;
    this.segmentBounds.min.set(
      Math.min(start.x, end.x),
      Math.min(start.y, end.y),
      Math.min(start.z, end.z),
    );
    this.segmentBounds.max.set(
      Math.max(start.x, end.x),
      Math.max(start.y, end.y),
      Math.max(start.z, end.z),
    );
    return distance;
  }

  private segmentIntersectsBounds(bounds: THREE.Box3, distance: number) {
    if (bounds.containsPoint(this.collisionOrigin)) return true;
    const intersection = this.collisionRaycaster.ray.intersectBox(
      bounds,
      this.collisionIntersection,
    );
    return (
      intersection !== null &&
      this.collisionOrigin.distanceToSquared(intersection) <=
        distance * distance
    );
  }

  private getCollisionCandidates() {
    const minCellX = collisionCell(this.segmentBounds.min.x);
    const maxCellX = collisionCell(this.segmentBounds.max.x);
    const minCellZ = collisionCell(this.segmentBounds.min.z);
    const maxCellZ = collisionCell(this.segmentBounds.max.z);
    const cellCount = (maxCellX - minCellX + 1) * (maxCellZ - minCellZ + 1);
    if (cellCount > MAX_QUERY_CELLS) return this.collidableObjects;

    this.collisionCandidates.length = 0;
    this.seenCollisionCandidates.clear();
    for (const object of this.overflowCollidables)
      this.addCollisionCandidate(object);
    for (let cellX = minCellX; cellX <= maxCellX; cellX++)
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++)
        for (const object of this.collidableGrid.get(gridKey(cellX, cellZ)) ??
          [])
          this.addCollisionCandidate(object);
    return this.collisionCandidates;
  }

  private addCollisionCandidate(object: THREE.Object3D) {
    if (this.seenCollisionCandidates.has(object)) return;
    this.seenCollisionCandidates.add(object);
    this.collisionCandidates.push(object);
  }

  private refreshCollidableObjects() {
    const live = new Set<THREE.Object3D>();
    this.collidableObjects.length = 0;
    this.collidableGrid.clear();
    this.overflowCollidables.length = 0;
    for (const system of this.systems)
      for (const object of system.getCollidableObjects?.() ?? []) {
        object.updateWorldMatrix(true, true);
        const bounds = this.collidableBounds.get(object) ?? new THREE.Box3();
        bounds.setFromObject(object);
        if (bounds.isEmpty()) continue;
        this.collidableBounds.set(object, bounds);
        this.collidableObjects.push(object);
        this.indexCollidable(object, bounds);
        live.add(object);
      }
    for (const object of this.collidableBounds.keys())
      if (!live.has(object)) this.collidableBounds.delete(object);
  }

  private indexCollidable(object: THREE.Object3D, bounds: THREE.Box3) {
    const minCellX = collisionCell(bounds.min.x);
    const maxCellX = collisionCell(bounds.max.x);
    const minCellZ = collisionCell(bounds.min.z);
    const maxCellZ = collisionCell(bounds.max.z);
    const cellCount = (maxCellX - minCellX + 1) * (maxCellZ - minCellZ + 1);
    if (cellCount > MAX_INDEX_CELLS_PER_OBJECT) {
      this.overflowCollidables.push(object);
      return;
    }
    for (let cellX = minCellX; cellX <= maxCellX; cellX++)
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        const key = gridKey(cellX, cellZ);
        const cell = this.collidableGrid.get(key);
        if (cell) cell.push(object);
        else this.collidableGrid.set(key, [object]);
      }
  }

  get<T extends WorldSystem>(id: string) {
    return this.systems.find((system) => system.id === id) as T | undefined;
  }

  dispose() {
    for (const system of this.systems) system.dispose?.();
    this.collidableObjects.length = 0;
    this.collidableBounds.clear();
    this.collidableGrid.clear();
    this.overflowCollidables.length = 0;
    this.collisionCandidates.length = 0;
    this.seenCollisionCandidates.clear();
  }
}

function collisionCell(value: number) {
  return Math.floor(value / COLLISION_CELL_SIZE);
}

function gridKey(cellX: number, cellZ: number) {
  return `${cellX}:${cellZ}`;
}

export function createWorld(definitions: readonly WorldSystemDefinition[]) {
  return new WorldRuntime(definitions);
}
