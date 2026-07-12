import * as THREE from "three";
import { railOffsetPosition } from "../sim/railSystem";
import type { IslandState } from "../sim/types";
import {
  GROUND_SURFACE_Y,
  type WorldAttachContext,
  type WorldStepContext,
  type WorldSystem,
  type WorldSystemDefinition,
} from "./worldSystem";
import { removeWhere } from "../core/collections";
import { mulberry32 } from "../core/random";

const STREAM_AHEAD = 220;
const CLEANUP_MARGIN = 38;

export type IslandStyle = "weathered" | "spires";
export type IslandFieldOptions = {
  style: IslandStyle;
  color: number;
  spacing?: number;
  firstDistance?: number;
};

export class IslandSystem implements WorldSystem {
  readonly id = "islands";
  readonly islands: IslandState[] = [];
  private readonly view: IslandView;
  private readonly spacing: number;
  private nextDistance: number;

  constructor(private readonly options: Required<IslandFieldOptions>) {
    this.spacing = options.spacing;
    this.nextDistance = options.firstDistance;
    this.view = new IslandView(options);
  }

  step(context: WorldStepContext) {
    while (this.nextDistance <= context.railDistance + STREAM_AHEAD) {
      const seed = hash(this.nextDistance / this.spacing);
      const side = seed % 2 === 0 ? -1 : 1;
      const offset = side * (23 + (seed % 17));
      const size = {
        x: 8 + (seed % 12),
        y: 5 + (seed % 12),
        z: 10 + ((seed >>> 4) % 17),
      };
      const position = railOffsetPosition(
        this.nextDistance,
        offset,
        GROUND_SURFACE_Y + size.y / 2 - 0.35,
      );
      this.islands.push({
        id: context.allocateId(),
        position,
        size,
        rotation: (seed % 31) * 0.07,
        railDistance: this.nextDistance,
      });
      this.nextDistance += this.spacing;
    }
    removeWhere(
      this.islands,
      (island) => island.railDistance < context.railDistance - CLEANUP_MARGIN,
    );
  }

  attach({ scene }: WorldAttachContext) {
    this.view.attach(scene);
  }

  render() {
    this.view.sync(this.islands);
  }

  getWaterObstacles() {
    return this.islands.map((island) => ({
      x: island.position.x,
      z: island.position.z,
      radiusX: island.size.x * 1.08,
      radiusZ: island.size.z * 1.08,
      rotation: island.rotation,
    }));
  }

  dispose() {
    this.view.dispose();
  }
}

class IslandView {
  private readonly views = new Map<number, THREE.Mesh>();
  private scene?: THREE.Scene;
  private material?: THREE.MeshStandardMaterial;

  constructor(private readonly options: Required<IslandFieldOptions>) {}

  attach(scene: THREE.Scene) {
    this.scene = scene;
    this.material = new THREE.MeshStandardMaterial({
      color: this.options.color,
      roughness: 1,
    });
  }

  sync(islands: readonly IslandState[]) {
    if (!this.scene || !this.material) return;
    const live = new Set(islands.map((island) => island.id));
    for (const [id, mesh] of this.views)
      if (!live.has(id)) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
        this.views.delete(id);
      }
    for (const island of islands) {
      let mesh = this.views.get(island.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          createIslandGeometry(island.id, this.options.style),
          this.material,
        );
        this.views.set(island.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(
        island.position.x,
        island.position.y,
        island.position.z,
      );
      mesh.scale.set(island.size.x, island.size.y, island.size.z);
      mesh.rotation.y = island.rotation;
    }
  }

  dispose() {
    for (const mesh of this.views.values()) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.views.clear();
    this.material?.dispose();
    this.scene = undefined;
    this.material = undefined;
  }
}

export function islandField(
  options: IslandFieldOptions,
): WorldSystemDefinition {
  const resolved = { spacing: 42, firstDistance: 34, ...options };
  return { create: () => new IslandSystem(resolved) };
}

function createIslandGeometry(seed: number, style: IslandStyle) {
  const random = mulberry32(seed * 0x9e3779b1);
  const positions: number[] = [];
  if (style === "spires") {
    appendRock(positions, random, {
      centerX: 0,
      centerZ: 0,
      scaleX: 1,
      scaleZ: 1,
      sides: 8,
      rings: [
        [-0.65, 1.16],
        [-0.5, 1.08],
        [-0.16, 0.94],
        [0.12, 0.78],
        [0.3, 0.64],
      ],
      topY: 0.38,
      jitter: 0.16,
      lean: 0.08,
    });
    const count = 2 + Math.floor(random() * 3);
    for (let index = 0; index < count; index++) {
      const dominant = index === 0;
      const angle = random() * Math.PI * 2;
      const distance = dominant ? random() * 0.14 : 0.25 + random() * 0.34;
      const width = dominant ? 0.58 + random() * 0.16 : 0.32 + random() * 0.18;
      const depth = dominant ? 0.5 + random() * 0.18 : 0.28 + random() * 0.18;
      const topY = dominant ? 0.9 + random() * 0.2 : 0.58 + random() * 0.3;
      appendRock(positions, random, {
        centerX: Math.cos(angle) * distance,
        centerZ: Math.sin(angle) * distance,
        scaleX: width,
        scaleZ: depth,
        sides: 6 + Math.floor(random() * 3),
        rings: [
          [0.02, 0.82],
          [0.3, 0.72],
          [topY - 0.22, 0.61],
          [topY - 0.1, 0.34],
        ],
        topY,
        jitter: 0.18,
        lean: 0.12,
      });
    }
  } else {
    const profile = Math.floor(random() * 3);
    const topRadius = profile === 0 ? 0.2 : profile === 1 ? 0.43 : 0.65;
    appendRock(positions, random, {
      centerX: 0,
      centerZ: 0,
      scaleX: 1,
      scaleZ: 1,
      sides: 7 + Math.floor(random() * 5),
      rings: [
        [-0.65, 1.16],
        [-0.5, 1.08],
        [-0.15, profile === 2 ? 0.98 : 0.9],
        [0.18, profile === 2 ? 0.82 : 0.68],
        [0.5, topRadius],
      ],
      topY: 0.5 + (profile === 0 ? 0.18 : 0),
      jitter: 0.19,
      lean: 0.22,
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

type RockSpec = {
  centerX: number;
  centerZ: number;
  scaleX: number;
  scaleZ: number;
  sides: number;
  rings: Array<[y: number, radius: number]>;
  topY: number;
  jitter: number;
  lean: number;
};

function appendRock(positions: number[], random: () => number, spec: RockSpec) {
  const angleJitter = Array.from(
    { length: spec.sides },
    () => (random() - 0.5) * spec.jitter,
  );
  const radiusJitter = Array.from(
    { length: spec.sides },
    () => 0.82 + random() * 0.34,
  );
  const leanX = (random() - 0.5) * spec.lean;
  const leanZ = (random() - 0.5) * spec.lean;
  const vertices = spec.rings.map(([y, radius], ringIndex) =>
    Array.from({ length: spec.sides }, (_, index) => {
      const angle = (index / spec.sides) * Math.PI * 2 + angleJitter[index];
      const progress = ringIndex / Math.max(spec.rings.length - 1, 1);
      const localNoise = 0.98 + random() * 0.04;
      return new THREE.Vector3(
        spec.centerX +
          Math.cos(angle) *
            radius *
            radiusJitter[index] *
            localNoise *
            spec.scaleX +
          leanX * progress,
        y +
          (ringIndex === 0 || ringIndex === spec.rings.length - 1
            ? 0
            : (random() - 0.5) * 0.05),
        spec.centerZ +
          Math.sin(angle) *
            radius *
            radiusJitter[index] *
            localNoise *
            spec.scaleZ +
          leanZ * progress,
      );
    }),
  );
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let ring = 0; ring < vertices.length - 1; ring++)
    for (let index = 0; index < spec.sides; index++) {
      const next = (index + 1) % spec.sides;
      if ((index + ring) % 2 === 0) {
        triangle(
          vertices[ring][index],
          vertices[ring + 1][index],
          vertices[ring][next],
        );
        triangle(
          vertices[ring][next],
          vertices[ring + 1][index],
          vertices[ring + 1][next],
        );
      } else {
        triangle(
          vertices[ring][index],
          vertices[ring + 1][next],
          vertices[ring][next],
        );
        triangle(
          vertices[ring][index],
          vertices[ring + 1][index],
          vertices[ring + 1][next],
        );
      }
    }
  const top = new THREE.Vector3(
    spec.centerX + leanX,
    spec.topY,
    spec.centerZ + leanZ,
  );
  for (let index = 0; index < spec.sides; index++)
    triangle(
      vertices.at(-1)![index],
      top,
      vertices.at(-1)![(index + 1) % spec.sides],
    );
}

function hash(value: number) {
  let result = Math.imul(Math.floor(value) + 1, 0x45d9f3b);
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  return (result ^ (result >>> 16)) >>> 0;
}
