import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { removeWhere } from "../core/collections";
import { mulberry32 } from "../core/random";
import { railFrameAtDistance, railOffsetPosition } from "../sim/railSystem";
import {
  GROUND_SURFACE_Y,
  type WorldAttachContext,
  type WorldRenderContext,
  type WorldStepContext,
  type WorldSystem,
  type WorldSystemDefinition,
} from "./worldSystem";

const STREAM_AHEAD = 300;
const CLEANUP_MARGIN = 85;
const FLIGHT_CORRIDOR_HALF_WIDTH = 15;
const FOREST_STEP = 40;
const TERRAIN_CELL_SIZE = 7.5;
const TERRAIN_CHUNK_SEGMENTS = 18;
const TERRAIN_CHUNK_SIZE = TERRAIN_CELL_SIZE * TERRAIN_CHUNK_SEGMENTS;
const TERRAIN_CHUNK_RADIUS = 2;
const TERRAIN_PREFETCH_RADIUS = TERRAIN_CHUNK_RADIUS + 1;

export type EvergreenProfile = "spruce" | "fir" | "pine";
export type ForestStyle = "dense" | "rocky" | "clearing";

export type ForestPatch = {
  id: number;
  railDistance: number;
  side: -1 | 1;
  offset: number;
  radiusX: number;
  radiusZ: number;
  density: number;
  style: ForestStyle;
  seed: number;
};

export type BorealLake = {
  id: number;
  railDistance: number;
  offset: number;
  radiusX: number;
  radiusZ: number;
  rotation: number;
  seed: number;
};

export type ForestTreeInstance = {
  profile: EvergreenProfile;
  x: number;
  z: number;
  height: number;
  rotation: number;
  tint: number;
};

export type BorealForestOptions = {
  ground: readonly [number, number, number];
  evergreen: readonly [number, number, number];
  granite: readonly [number, number, number];
  water: number;
  earth: number;
};

type SharedResources = {
  treeGeometries: Record<EvergreenProfile, THREE.BufferGeometry>;
  treeMaterial: THREE.MeshStandardMaterial;
  rockGeometry: THREE.BufferGeometry;
  rockMaterial: THREE.MeshStandardMaterial;
  logGeometry: THREE.BufferGeometry;
  logMaterial: THREE.MeshStandardMaterial;
};

export class BorealForestSystem implements WorldSystem {
  readonly id = "boreal-forest";
  readonly features: ForestPatch[] = [];
  readonly lakes: BorealLake[] = [];
  private readonly views = new Map<number, THREE.Group>();
  private readonly lakeViews = new Map<number, THREE.Group>();
  private readonly groundMaterial: THREE.MeshStandardMaterial;
  private readonly waterMaterial: THREE.MeshStandardMaterial;
  private readonly shoreMaterial: THREE.MeshStandardMaterial;
  private readonly resources: SharedResources;
  private scene?: THREE.Scene;
  private readonly terrainChunks = new Map<string, THREE.Mesh>();
  private nextDistance = 20;

  constructor(private readonly options: BorealForestOptions) {
    this.groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 1,
      flatShading: true,
    });
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: options.water,
      emissive: options.water,
      emissiveIntensity: 0.18,
      roughness: 0.28,
      metalness: 0.12,
      transparent: true,
      opacity: 0.88,
    });
    this.shoreMaterial = new THREE.MeshStandardMaterial({
      color: options.earth,
      roughness: 1,
      flatShading: true,
    });
    this.resources = {
      treeGeometries: {
        spruce: createEvergreenGeometry("spruce", options),
        fir: createEvergreenGeometry("fir", options),
        pine: createEvergreenGeometry("pine", options),
      },
      treeMaterial: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 1,
        flatShading: true,
      }),
      rockGeometry: new THREE.DodecahedronGeometry(1, 0),
      rockMaterial: new THREE.MeshStandardMaterial({
        color: options.granite[1],
        roughness: 0.95,
        flatShading: true,
      }),
      logGeometry: createLogGeometry(),
      logMaterial: new THREE.MeshStandardMaterial({
        color: 0x4a3424,
        roughness: 1,
        flatShading: true,
      }),
    };
  }

  step(context: WorldStepContext) {
    while (this.nextDistance <= context.railDistance + STREAM_AHEAD) {
      const seed = hash(Math.floor(this.nextDistance * 31));
      const lakeSide = seed % 3 === 0 ? ((seed & 1) === 0 ? -1 : 1) : undefined;
      for (const side of [-1, 1] as const) {
        const sideSeed = hash(seed + (side === 1 ? 271 : 0));
        const random = mulberry32(sideSeed);
        const besideLake = side === lakeSide;
        const style = besideLake
          ? "clearing"
          : ((["dense", "rocky", "clearing"] as const)[
              Math.floor(random() * 3)
            ] ?? "dense");
        const radiusX = 12 + random() * 4;
        this.features.push({
          id: context.allocateId(),
          railDistance: this.nextDistance + (side === 1 ? 9 : 0),
          side,
          offset: FLIGHT_CORRIDOR_HALF_WIDTH + radiusX + 2 + random() * 4,
          radiusX,
          radiusZ: 24 + random() * 9,
          density: besideLake ? 0.42 : 0.58 + random() * 0.28,
          style,
          seed: sideSeed,
        });
      }
      if (lakeSide) {
        const random = mulberry32(hash(seed + 977));
        this.lakes.push({
          id: context.allocateId(),
          railDistance: this.nextDistance + 12 + random() * 6,
          offset: lakeSide * (13 + random() * 5),
          radiusX: 9 + random() * 4,
          radiusZ: 13 + random() * 8,
          rotation: (random() - 0.5) * 0.42,
          seed: hash(seed + 1297),
        });
      }
      this.nextDistance += FOREST_STEP;
    }
    removeWhere(
      this.features,
      (feature) => feature.railDistance < context.railDistance - CLEANUP_MARGIN,
    );
    removeWhere(
      this.lakes,
      (lake) => lake.railDistance < context.railDistance - CLEANUP_MARGIN,
    );
  }

  attach({ scene }: WorldAttachContext) {
    this.scene = scene;
    this.updateTerrainChunks(0, 0);
  }

  render({ centerX, centerZ }: WorldRenderContext) {
    if (!this.scene) return;
    this.updateTerrainChunks(centerX, centerZ);
    this.removeExpiredViews();

    for (const feature of this.features) {
      const position = railOffsetPosition(
        feature.railDistance,
        feature.side * feature.offset,
        GROUND_SURFACE_Y,
      );
      const rail = railFrameAtDistance(feature.railDistance);
      let view = this.views.get(feature.id);
      if (!view) {
        view = createForestPatchView(
          feature,
          this.resources,
          position,
          rail.heading,
        );
        this.views.set(feature.id, view);
        this.scene.add(view);
      }
      view.position.set(
        position.x,
        position.y + borealTerrainHeight(position.x, position.z),
        position.z,
      );
      view.rotation.y = -rail.heading;
    }

    for (const lake of this.lakes) {
      const position = railOffsetPosition(
        lake.railDistance,
        lake.offset,
        GROUND_SURFACE_Y,
      );
      const rail = railFrameAtDistance(lake.railDistance);
      let view = this.lakeViews.get(lake.id);
      if (!view) {
        view = createLakeView(
          lake,
          this.waterMaterial,
          this.shoreMaterial,
          this.resources,
        );
        this.lakeViews.set(lake.id, view);
        this.scene.add(view);
      }
      view.position.set(
        position.x,
        position.y + borealTerrainHeight(position.x, position.z) + 0.86,
        position.z,
      );
      view.rotation.y = -rail.heading + lake.rotation;
    }
  }

  getCollidableObjects() {
    return [...this.views.values()];
  }

  dispose() {
    for (const view of this.views.values()) view.removeFromParent();
    this.views.clear();
    for (const view of this.lakeViews.values()) disposeLakeView(view);
    this.lakeViews.clear();
    for (const chunk of this.terrainChunks.values()) {
      chunk.removeFromParent();
      chunk.geometry.dispose();
    }
    this.terrainChunks.clear();
    this.groundMaterial.dispose();
    this.waterMaterial.dispose();
    this.shoreMaterial.dispose();
    for (const geometry of Object.values(this.resources.treeGeometries))
      geometry.dispose();
    this.resources.treeMaterial.dispose();
    this.resources.rockGeometry.dispose();
    this.resources.rockMaterial.dispose();
    this.resources.logGeometry.dispose();
    this.resources.logMaterial.dispose();
    this.scene = undefined;
  }

  private removeExpiredViews() {
    const live = new Set(this.features.map((feature) => feature.id));
    for (const [id, view] of this.views) {
      if (live.has(id)) continue;
      view.removeFromParent();
      this.views.delete(id);
    }
    const liveLakes = new Set(this.lakes.map((lake) => lake.id));
    for (const [id, view] of this.lakeViews) {
      if (liveLakes.has(id)) continue;
      disposeLakeView(view);
      this.lakeViews.delete(id);
    }
  }

  private updateTerrainChunks(centerX: number, centerZ: number) {
    if (!this.scene) return;
    const centerChunkX = Math.floor(centerX / TERRAIN_CHUNK_SIZE);
    const centerChunkZ = Math.floor(centerZ / TERRAIN_CHUNK_SIZE);
    const liveChunks = new Set<string>();

    for (
      let chunkZ = centerChunkZ - TERRAIN_CHUNK_RADIUS;
      chunkZ <= centerChunkZ + TERRAIN_CHUNK_RADIUS;
      chunkZ++
    )
      for (
        let chunkX = centerChunkX - TERRAIN_CHUNK_RADIUS;
        chunkX <= centerChunkX + TERRAIN_CHUNK_RADIUS;
        chunkX++
      ) {
        const key = terrainChunkKey(chunkX, chunkZ);
        liveChunks.add(key);
        const chunk = this.terrainChunks.get(key);
        if (chunk) chunk.visible = true;
        else this.createTerrainChunk(chunkX, chunkZ, true);
      }

    const cachedChunks = new Set<string>();
    for (
      let chunkZ = centerChunkZ - TERRAIN_PREFETCH_RADIUS;
      chunkZ <= centerChunkZ + TERRAIN_PREFETCH_RADIUS;
      chunkZ++
    )
      for (
        let chunkX = centerChunkX - TERRAIN_PREFETCH_RADIUS;
        chunkX <= centerChunkX + TERRAIN_PREFETCH_RADIUS;
        chunkX++
      )
        cachedChunks.add(terrainChunkKey(chunkX, chunkZ));

    for (const [key, chunk] of this.terrainChunks) {
      if (cachedChunks.has(key)) {
        chunk.visible = liveChunks.has(key);
        continue;
      }
      chunk.removeFromParent();
      chunk.geometry.dispose();
      this.terrainChunks.delete(key);
    }

    for (
      let chunkZ = centerChunkZ - TERRAIN_PREFETCH_RADIUS;
      chunkZ <= centerChunkZ + TERRAIN_PREFETCH_RADIUS;
      chunkZ++
    )
      for (
        let chunkX = centerChunkX - TERRAIN_PREFETCH_RADIUS;
        chunkX <= centerChunkX + TERRAIN_PREFETCH_RADIUS;
        chunkX++
      ) {
        const key = terrainChunkKey(chunkX, chunkZ);
        if (this.terrainChunks.has(key)) continue;
        this.createTerrainChunk(chunkX, chunkZ, false);
        return;
      }
  }

  private createTerrainChunk(chunkX: number, chunkZ: number, visible: boolean) {
    if (!this.scene) return;
    const chunk = new THREE.Mesh(
      createBorealTerrainChunkGeometry(chunkX, chunkZ, this.options),
      this.groundMaterial,
    );
    chunk.position.set(
      chunkX * TERRAIN_CHUNK_SIZE,
      GROUND_SURFACE_Y,
      chunkZ * TERRAIN_CHUNK_SIZE,
    );
    chunk.visible = visible;
    this.terrainChunks.set(terrainChunkKey(chunkX, chunkZ), chunk);
    this.scene.add(chunk);
  }
}

export function borealForest(
  options: BorealForestOptions,
): WorldSystemDefinition {
  return { create: () => new BorealForestSystem(options) };
}

export function createForestPatchLayout(
  feature: ForestPatch,
): ForestTreeInstance[] {
  const random = mulberry32(hash(feature.seed + 411));
  const targetCount = Math.floor((38 + random() * 27) * feature.density);
  const clearingAngle = random() * Math.PI * 2;
  const clearingX = Math.cos(clearingAngle) * feature.radiusX * 0.32;
  const clearingZ = Math.sin(clearingAngle) * feature.radiusZ * 0.35;
  const clearingRadius =
    feature.style === "clearing" ? 5.2 + random() * 2.8 : 2.4 + random();
  const trees: ForestTreeInstance[] = [];

  for (let attempt = 0; attempt < targetCount * 5; attempt++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random());
    const x = Math.cos(angle) * feature.radiusX * distance;
    const z = Math.sin(angle) * feature.radiusZ * distance;
    const lateralOffset = feature.side * feature.offset + x;
    if (Math.abs(lateralOffset) < FLIGHT_CORRIDOR_HALF_WIDTH) continue;
    if (Math.hypot(x - clearingX, z - clearingZ) < clearingRadius) continue;
    const groveMask =
      0.58 +
      Math.sin(x * 0.31 + z * 0.17 + feature.seed * 0.001) * 0.2 +
      Math.sin(z * 0.11 - x * 0.19) * 0.14;
    if (random() > Math.min(0.96, groveMask * feature.density + 0.18)) continue;
    const profileRoll = random();
    trees.push({
      profile:
        profileRoll < 0.54 ? "spruce" : profileRoll < 0.82 ? "fir" : "pine",
      x,
      z,
      height: 1.02 + random() * 1.14,
      rotation: random() * Math.PI * 2,
      tint: 0.82 + random() * 0.24,
    });
    if (trees.length >= targetCount) break;
  }
  return trees;
}

export function createEvergreenGeometry(
  profile: EvergreenProfile,
  options: Pick<BorealForestOptions, "evergreen" | "earth"> = {
    evergreen: [0x102f2a, 0x19483b, 0x2d6045],
    earth: 0x4a3424,
  },
) {
  const definitions = {
    spruce: [
      { radius: 1.28, height: 2.3, y: 1.78 },
      { radius: 1.02, height: 2.18, y: 2.78 },
      { radius: 0.73, height: 1.9, y: 3.7 },
    ],
    fir: [
      { radius: 1.48, height: 1.95, y: 1.65 },
      { radius: 1.22, height: 1.9, y: 2.55 },
      { radius: 0.92, height: 1.75, y: 3.36 },
      { radius: 0.56, height: 1.35, y: 4.06 },
    ],
    pine: [
      { radius: 1.2, height: 1.55, y: 2.08 },
      { radius: 0.98, height: 1.42, y: 2.93 },
      { radius: 0.68, height: 1.28, y: 3.65 },
    ],
  } satisfies Record<
    EvergreenProfile,
    { radius: number; height: number; y: number }[]
  >;
  const geometries: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.27, 2.25, 6, 1);
  trunk.translate(0, 1.12, 0);
  addGeometryColor(trunk, options.earth);
  geometries.push(trunk);

  definitions[profile].forEach((tier, index) => {
    const crown = new THREE.ConeGeometry(tier.radius, tier.height, 7, 1);
    crown.translate(0, tier.y, 0);
    addGeometryColor(
      crown,
      options.evergreen[Math.min(options.evergreen.length - 1, index)],
    );
    geometries.push(crown);
  });
  const geometry = mergeGeometries(geometries, false);
  for (const source of geometries) source.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function borealTerrainHeight(x: number, z: number) {
  const warpX = fractalNoise(x * 0.0035, z * 0.0035, 137) * 34;
  const warpZ = fractalNoise(x * 0.0035, z * 0.0035, 911) * 34;
  const warpedX = x + warpX;
  const warpedZ = z + warpZ;
  const broad = fractalNoise(warpedX * 0.006, warpedZ * 0.006, 431) * 1.7;
  const rolling = fractalNoise(warpedX * 0.018, warpedZ * 0.018, 1777) * 1.05;
  const knolls = fractalNoise(warpedX * 0.032, warpedZ * 0.032, 2237) * 0.62;
  const ridge =
    (1 - Math.abs(fractalNoise(warpedX * 0.017, warpedZ * 0.017, 2903))) * 0.38;
  const detail = fractalNoise(x * 0.065, z * 0.065, 4001) * 0.18;
  return (broad + rolling + knolls + ridge + detail) * 3.1 - 1.6;
}

export function createBorealTerrainChunkGeometry(
  chunkX: number,
  chunkZ: number,
  options: BorealForestOptions,
) {
  const columns = TERRAIN_CHUNK_SEGMENTS + 1;
  const sampleColumns = columns + 2;
  const vertexCount = columns * columns;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const heightSamples = new Float32Array(sampleColumns * sampleColumns);
  const indices: number[] = [];
  const originX = chunkX * TERRAIN_CHUNK_SIZE;
  const originZ = chunkZ * TERRAIN_CHUNK_SIZE;

  for (let row = 0; row < sampleColumns; row++)
    for (let column = 0; column < sampleColumns; column++)
      heightSamples[row * sampleColumns + column] = borealTerrainHeight(
        originX + (column - 1) * TERRAIN_CELL_SIZE,
        originZ + (row - 1) * TERRAIN_CELL_SIZE,
      );

  for (let row = 0; row < columns; row++)
    for (let column = 0; column < columns; column++) {
      const vertex = row * columns + column;
      const localX = column * TERRAIN_CELL_SIZE;
      const localZ = row * TERRAIN_CELL_SIZE;
      positions[vertex * 3] = localX;
      positions[vertex * 3 + 1] =
        heightSamples[(row + 1) * sampleColumns + column + 1];
      positions[vertex * 3 + 2] = localZ;
    }

  for (let row = 0; row < TERRAIN_CHUNK_SEGMENTS; row++)
    for (let column = 0; column < TERRAIN_CHUNK_SEGMENTS; column++) {
      const a = row * columns + column;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      const worldRow = chunkZ * TERRAIN_CHUNK_SEGMENTS + row;
      const worldColumn = chunkX * TERRAIN_CHUNK_SEGMENTS + column;
      if ((hash(worldRow * 193 + worldColumn * 389) & 1) === 0)
        indices.push(a, c, b, b, c, d);
      else indices.push(a, c, d, a, d, b);
    }

  writeTerrainColors(
    positions,
    colors,
    heightSamples,
    sampleColumns,
    originX,
    originZ,
    options,
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createForestPatchView(
  feature: ForestPatch,
  resources: SharedResources,
  center: { x: number; z: number },
  heading: number,
) {
  const group = new THREE.Group();
  const trees = createForestPatchLayout(feature);
  const baseHeight = borealTerrainHeight(center.x, center.z);
  for (const profile of ["spruce", "fir", "pine"] as const) {
    const instances = trees.filter((tree) => tree.profile === profile);
    if (instances.length === 0) continue;
    const mesh = new THREE.InstancedMesh(
      resources.treeGeometries[profile],
      resources.treeMaterial,
      instances.length,
    );
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    instances.forEach((tree, index) => {
      const world = localToWorld(center, heading, tree.x, tree.z);
      position.set(
        tree.x,
        borealTerrainHeight(world.x, world.z) - baseHeight,
        tree.z,
      );
      euler.set(0, tree.rotation, (tree.tint - 0.94) * 0.055);
      rotation.setFromEuler(euler);
      scale.set(
        tree.height * (0.9 + (tree.tint - 0.82) * 0.3),
        tree.height,
        tree.height * (0.9 + (1.06 - tree.tint) * 0.22),
      );
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new THREE.Color().setScalar(tree.tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  group.add(createRockOutcrops(feature, resources));
  if (feature.seed % 3 !== 1) group.add(createFallenLogs(feature, resources));
  return group;
}

function createRockOutcrops(feature: ForestPatch, resources: SharedResources) {
  const random = mulberry32(hash(feature.seed + 733));
  const count = feature.style === "rocky" ? 10 : 5 + Math.floor(random() * 4);
  const rocks = new THREE.InstancedMesh(
    resources.rockGeometry,
    resources.rockMaterial,
    count,
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  for (let index = 0; index < count; index++) {
    const angle = random() * Math.PI * 2;
    const distance = 0.32 + Math.sqrt(random()) * 0.72;
    const size =
      index === 0
        ? 4.2 + random() * 2.8
        : index === 1
          ? 2.6 + random() * 3.4
          : 0.48 + Math.pow(random(), 1.8) * 2;
    position.set(
      index === 0
        ? feature.side * feature.radiusX * (0.35 + random() * 0.38)
        : Math.cos(angle) * feature.radiusX * distance,
      size * 0.25,
      Math.sin(angle) * feature.radiusZ * distance,
    );
    euler.set(random() * 0.55, random() * Math.PI, random() * 0.45);
    rotation.setFromEuler(euler);
    scale.set(
      size * (0.82 + random() * 0.55),
      size * (0.52 + random() * 0.42),
      size * (0.78 + random() * 0.62),
    );
    matrix.compose(position, rotation, scale);
    rocks.setMatrixAt(index, matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.computeBoundingBox();
  rocks.computeBoundingSphere();
  return rocks;
}

function createFallenLogs(feature: ForestPatch, resources: SharedResources) {
  const random = mulberry32(hash(feature.seed + 1777));
  const count = 1 + (feature.seed % 3 === 0 ? 1 : 0);
  const logs = new THREE.InstancedMesh(
    resources.logGeometry,
    resources.logMaterial,
    count,
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  for (let index = 0; index < count; index++) {
    const side = random() < 0.5 ? -1 : 1;
    position.set(
      side * feature.radiusX * (0.28 + random() * 0.58),
      0.22,
      (random() - 0.5) * feature.radiusZ * 1.35,
    );
    euler.set((random() - 0.5) * 0.12, random() * Math.PI, Math.PI / 2);
    rotation.setFromEuler(euler);
    const length = 0.7 + random() * 0.85;
    scale.set(0.8 + random() * 0.45, length, 0.8 + random() * 0.35);
    matrix.compose(position, rotation, scale);
    logs.setMatrixAt(index, matrix);
  }
  logs.instanceMatrix.needsUpdate = true;
  logs.computeBoundingBox();
  logs.computeBoundingSphere();
  return logs;
}

function createLakeView(
  lake: BorealLake,
  waterMaterial: THREE.Material,
  shoreMaterial: THREE.Material,
  resources: SharedResources,
) {
  const group = new THREE.Group();
  const shore = new THREE.Mesh(
    createLakeShapeGeometry(lake.seed, true),
    shoreMaterial,
  );
  shore.userData.disposeGeometry = true;
  shore.rotation.x = -Math.PI / 2;
  shore.scale.set(lake.radiusX * 1.08, lake.radiusZ * 1.08, 1);
  shore.position.y = -0.05;
  group.add(shore);

  const water = new THREE.Mesh(
    createLakeShapeGeometry(lake.seed, false),
    waterMaterial,
  );
  water.userData.disposeGeometry = true;
  water.rotation.x = -Math.PI / 2;
  water.scale.set(lake.radiusX, lake.radiusZ, 1);
  water.renderOrder = 1;
  group.add(water);

  const random = mulberry32(hash(lake.seed + 521));
  const rockCount = 7 + Math.floor(random() * 5);
  const rocks = new THREE.InstancedMesh(
    resources.rockGeometry,
    resources.rockMaterial,
    rockCount,
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  for (let index = 0; index < rockCount; index++) {
    const angle = random() * Math.PI * 2;
    const size = 0.35 + Math.pow(random(), 1.7) * 1.3;
    position.set(
      Math.cos(angle) * lake.radiusX * (0.95 + random() * 0.22),
      size * 0.2,
      Math.sin(angle) * lake.radiusZ * (0.95 + random() * 0.22),
    );
    euler.set(random() * 0.45, random() * Math.PI, random() * 0.38);
    rotation.setFromEuler(euler);
    scale.set(size * (0.8 + random()), size * (0.5 + random() * 0.4), size);
    matrix.compose(position, rotation, scale);
    rocks.setMatrixAt(index, matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  group.add(rocks);
  return group;
}

function createLakeShapeGeometry(seed: number, ring: boolean) {
  const random = mulberry32(hash(seed + 101));
  const segments = 30;
  const radii = Array.from({ length: segments }, () => 0.92 + random() * 0.14);
  const points = radii.map((radius, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector2(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
    );
  });
  const shape = new THREE.Shape(points);
  if (ring) {
    const hole = radii.map((radius, index) => {
      const reversed = segments - 1 - index;
      const angle = (reversed / segments) * Math.PI * 2;
      return new THREE.Vector2(
        Math.cos(angle) * radius * 0.82,
        Math.sin(angle) * radius * 0.82,
      );
    });
    shape.holes.push(new THREE.Path(hole));
  }
  return new THREE.ShapeGeometry(shape);
}

function createLogGeometry() {
  const geometry = new THREE.CylinderGeometry(0.24, 0.31, 4.5, 7, 1);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function writeTerrainColors(
  positions: Float32Array,
  colors: Float32Array,
  heightSamples: Float32Array,
  sampleColumns: number,
  centerX: number,
  centerZ: number,
  options: BorealForestOptions,
) {
  const columns = TERRAIN_CHUNK_SEGMENTS + 1;
  const dark = new THREE.Color(options.ground[0]);
  const light = new THREE.Color(options.ground[1]);
  const moss = new THREE.Color(options.ground[2]);
  const earth = new THREE.Color(options.earth);
  const granite = new THREE.Color(options.granite[0]);
  const color = new THREE.Color();
  const exposed = new THREE.Color();

  for (let row = 0; row < columns; row++)
    for (let column = 0; column < columns; column++) {
      const vertex = row * columns + column;
      const worldX = centerX + positions[vertex * 3];
      const worldZ = centerZ + positions[vertex * 3 + 2];
      const sample = (row + 1) * sampleColumns + column + 1;
      const slopeX =
        (heightSamples[sample + 1] - heightSamples[sample - 1]) /
        (TERRAIN_CELL_SIZE * 2);
      const slopeZ =
        (heightSamples[sample + sampleColumns] -
          heightSamples[sample - sampleColumns]) /
        (TERRAIN_CELL_SIZE * 2);
      const slope = Math.hypot(slopeX, slopeZ);
      const moisture =
        fractalNoise(worldX * 0.018, worldZ * 0.018, 6323) * 0.5 + 0.5;
      const mossAmount =
        smoothstep(0.42, 0.82, moisture) *
        (1 - smoothstep(0.18, 0.52, slope)) *
        0.58;
      const exposedAmount = smoothstep(0.2, 0.58, slope);
      color.copy(dark).lerp(light, moisture);
      color.lerp(moss, mossAmount);
      exposed.copy(earth).lerp(granite, smoothstep(0.38, 0.72, slope));
      color.lerp(exposed, exposedAmount * 0.68);
      color.multiplyScalar(
        THREE.MathUtils.clamp(
          0.92 + positions[vertex * 3 + 1] * 0.035,
          0.82,
          1.08,
        ),
      );
      colors[vertex * 3] = color.r;
      colors[vertex * 3 + 1] = color.g;
      colors[vertex * 3 + 2] = color.b;
    }
}

function fractalNoise(x: number, z: number, seed: number) {
  let amplitude = 0.55;
  let frequency = 1;
  let total = 0;
  let normalization = 0;
  for (let octave = 0; octave < 4; octave++) {
    total +=
      valueNoise(x * frequency, z * frequency, seed + octave * 1013) *
      amplitude;
    normalization += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return total / normalization;
}

function valueNoise(x: number, z: number, seed: number) {
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const localX = smoothCurve(x - cellX);
  const localZ = smoothCurve(z - cellZ);
  const bottom = THREE.MathUtils.lerp(
    noiseHash(cellX, cellZ, seed),
    noiseHash(cellX + 1, cellZ, seed),
    localX,
  );
  const top = THREE.MathUtils.lerp(
    noiseHash(cellX, cellZ + 1, seed),
    noiseHash(cellX + 1, cellZ + 1, seed),
    localX,
  );
  return THREE.MathUtils.lerp(bottom, top, localZ);
}

function noiseHash(x: number, z: number, seed: number) {
  let value = Math.imul(x, 0x1f123bb5) ^ Math.imul(z, 0x5f356495) ^ seed;
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39);
  return ((value ^ (value >>> 15)) >>> 0) / 2147483648 - 1;
}

function smoothCurve(value: number) {
  return value * value * (3 - 2 * value);
}

function smoothstep(minimum: number, maximum: number, value: number) {
  const normalized = THREE.MathUtils.clamp(
    (value - minimum) / (maximum - minimum),
    0,
    1,
  );
  return normalized * normalized * (3 - 2 * normalized);
}

function terrainChunkKey(chunkX: number, chunkZ: number) {
  return `${chunkX}:${chunkZ}`;
}

function addGeometryColor(geometry: THREE.BufferGeometry, color: number) {
  const count = geometry.getAttribute("position").count;
  const value = new THREE.Color(color);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    colors[index * 3] = value.r;
    colors[index * 3 + 1] = value.g;
    colors[index * 3 + 2] = value.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function localToWorld(
  center: { x: number; z: number },
  heading: number,
  x: number,
  z: number,
) {
  const cosine = Math.cos(heading);
  const sine = Math.sin(heading);
  return {
    x: center.x + cosine * x - sine * z,
    z: center.z + sine * x + cosine * z,
  };
}

function disposeLakeView(view: THREE.Group) {
  view.removeFromParent();
  view.traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      object.userData.disposeGeometry === true
    )
      object.geometry.dispose();
  });
}

function hash(value: number) {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}
