import * as THREE from "three";
import { railFrameAtDistance, railOffsetPosition } from "../sim/railSystem";
import {
  GROUND_SURFACE_Y,
  type WorldAttachContext,
  type WorldRenderContext,
  type WorldStepContext,
  type WorldSystem,
  type WorldSystemDefinition,
} from "./worldSystem";
import { removeWhere } from "../core/collections";
import { mulberry32 } from "../core/random";

const STREAM_AHEAD = 260;
const CLEANUP_MARGIN = 70;

type CanyonFeature = {
  id: number;
  railDistance: number;
  side: -1 | 1;
  offset: number;
  width: number;
  height: number;
  depth: number;
  arch: boolean;
  profile: MesaProfile;
};

export type MesaProfile = "table" | "butte" | "weathered" | "shelf";

export type DesertCanyonOptions = {
  sand: number;
  rock: readonly [number, number, number];
};

export class DesertCanyonSystem implements WorldSystem {
  readonly id = "desert-canyon";
  readonly features: CanyonFeature[] = [];
  private readonly views = new Map<number, THREE.Group>();
  private readonly rockMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true,
  });
  private readonly rubbleMaterial: THREE.MeshStandardMaterial;
  private nextDistance = 18;
  private scene?: THREE.Scene;
  private ground?: THREE.Mesh;

  constructor(private readonly options: DesertCanyonOptions) {
    this.rubbleMaterial = new THREE.MeshStandardMaterial({
      color: options.rock[0],
      roughness: 1,
      flatShading: true,
    });
  }

  step(context: WorldStepContext) {
    while (this.nextDistance <= context.railDistance + STREAM_AHEAD) {
      const seed = hash(this.nextDistance);
      for (const side of [-1, 1] as const) {
        const sideSeed = hash(seed + (side === 1 ? 97 : 0));
        this.features.push({
          id: context.allocateId(),
          railDistance: this.nextDistance + (side === 1 ? 7 : 0),
          side,
          offset: 29 + (sideSeed % 15),
          width: 15 + (sideSeed % 13),
          height: 11 + ((sideSeed >>> 5) % 15),
          depth: 17 + ((sideSeed >>> 10) % 18),
          arch: sideSeed % 9 === 0,
          profile: (["table", "butte", "weathered", "shelf"] as const)[
            (sideSeed >>> 15) % 4
          ],
        });
      }
      this.nextDistance += 32;
    }
    removeWhere(
      this.features,
      (feature) => feature.railDistance < context.railDistance - CLEANUP_MARGIN,
    );
  }

  attach({ scene }: WorldAttachContext) {
    this.scene = scene;
    const geometry = new THREE.PlaneGeometry(520, 520, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: this.options.sand,
        roughness: 1,
      }),
    );
    this.ground.position.y = GROUND_SURFACE_Y;
    scene.add(this.ground);
  }

  render({ centerX, centerZ }: WorldRenderContext) {
    if (!this.scene || !this.ground) return;
    this.ground.position.x = centerX;
    this.ground.position.z = centerZ;
    const live = new Set(this.features.map((feature) => feature.id));
    for (const [id, view] of this.views)
      if (!live.has(id)) {
        this.scene.remove(view);
        disposeGroup(view);
        this.views.delete(id);
      }
    for (const feature of this.features) {
      let view = this.views.get(feature.id);
      if (!view) {
        view = createFormation(
          feature,
          this.options.rock,
          this.rockMaterial,
          this.rubbleMaterial,
        );
        this.views.set(feature.id, view);
        this.scene.add(view);
      }
      const position = railOffsetPosition(
        feature.railDistance,
        feature.side * feature.offset,
        GROUND_SURFACE_Y,
      );
      const rail = railFrameAtDistance(feature.railDistance);
      view.position.set(position.x, position.y, position.z);
      view.rotation.y = -rail.heading;
    }
  }

  dispose() {
    this.ground?.geometry.dispose();
    if (this.ground?.material instanceof THREE.Material)
      this.ground.material.dispose();
    for (const view of this.views.values()) disposeGroup(view);
    this.rockMaterial.dispose();
    this.rubbleMaterial.dispose();
    this.views.clear();
    this.scene = undefined;
    this.ground = undefined;
  }
}

export function desertCanyon(
  options: DesertCanyonOptions,
): WorldSystemDefinition {
  return { create: () => new DesertCanyonSystem(options) };
}

function createFormation(
  feature: CanyonFeature,
  colors: DesertCanyonOptions["rock"],
  rockMaterial: THREE.MeshStandardMaterial,
  rubbleMaterial: THREE.MeshStandardMaterial,
) {
  const group = new THREE.Group();
  const main = new THREE.Mesh(
    createMesaGeometry({
      seed: feature.id,
      width: feature.width,
      depth: feature.depth,
      height: feature.height,
      profile: feature.profile,
      colors,
    }),
    rockMaterial,
  );
  group.add(main);

  const random = mulberry32(hash(feature.id * 41));
  const satelliteCount = feature.arch ? 2 : 1 + Math.floor(random() * 2);
  for (let index = 0; index < satelliteCount; index++) {
    const scale = 0.24 + random() * 0.24;
    const angle = random() * Math.PI * 2;
    const satellite = new THREE.Mesh(
      createMesaGeometry({
        seed: hash(feature.id * 13 + index),
        width: feature.width * scale,
        depth: feature.depth * scale * (0.75 + random() * 0.5),
        height: feature.height * (0.38 + random() * 0.32),
        profile: random() > 0.55 ? "butte" : "weathered",
        colors,
        segments: 10,
      }),
      rockMaterial,
    );
    satellite.position.set(
      Math.cos(angle) * feature.width * (0.72 + random() * 0.34),
      0,
      Math.sin(angle) * feature.depth * (0.68 + random() * 0.3),
    );
    satellite.rotation.y = random() * Math.PI;
    group.add(satellite);
  }

  group.add(createTalus(feature, random, rubbleMaterial));
  return group;
}

type MesaGeometryOptions = {
  seed: number;
  width: number;
  depth: number;
  height: number;
  profile: MesaProfile;
  colors: readonly [number, number, number];
  segments?: number;
};

export function createMesaGeometry(options: MesaGeometryOptions) {
  const segments = options.segments ?? 14;
  const heights = [0, 0.055, 0.15, 0.27, 0.41, 0.56, 0.7, 0.83, 0.93, 1];
  const radii = profileRadii(options.profile);
  const random = mulberry32(hash(options.seed));
  const phaseA = random() * Math.PI * 2;
  const phaseB = random() * Math.PI * 2;
  const collapseAngle = random() * Math.PI * 2;
  const collapseWidth = 0.38 + random() * 0.5;
  const collapseStrength =
    options.profile === "weathered"
      ? 0.26 + random() * 0.14
      : 0.08 + random() * 0.1;
  const angularVariation = Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return (
      1 +
      Math.sin(angle * 2 + phaseA) * 0.09 +
      Math.sin(angle * 3 + phaseB) * 0.055 +
      (random() - 0.5) * 0.055
    );
  });
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring < heights.length; ring++) {
    const y = heights[ring];
    for (let index = 0; index < segments; index++) {
      const angle = (index / segments) * Math.PI * 2;
      const angleDistance = Math.abs(
        Math.atan2(
          Math.sin(angle - collapseAngle),
          Math.cos(angle - collapseAngle),
        ),
      );
      const collapse =
        Math.exp(-Math.pow(angleDistance / collapseWidth, 2)) *
        collapseStrength *
        Math.sin(y * Math.PI);
      const verticalErosion =
        Math.sin(angle * 2 + phaseB + y * 5.2) * 0.035 * Math.sin(y * Math.PI);
      const radius = Math.max(
        0.34,
        radii[ring] * angularVariation[index] - collapse + verticalErosion,
      );
      const ledgeSkew =
        ring === 2 || ring === 5 || ring === 8 ? (random() - 0.5) * 0.035 : 0;
      positions.push(
        Math.cos(angle) * options.width * (radius + ledgeSkew),
        y * options.height,
        Math.sin(angle) * options.depth * (radius - ledgeSkew),
      );
      appendRockColor(colors, options.colors, y, angle, phaseA);
    }
  }

  for (let ring = 0; ring < heights.length - 1; ring++) {
    for (let index = 0; index < segments; index++) {
      const next = (index + 1) % segments;
      const a = ring * segments + index;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + index;
      const d = (ring + 1) * segments + next;
      if ((ring + index) % 2 === 0) indices.push(a, c, b, b, c, d);
      else indices.push(a, d, b, a, c, d);
    }
  }

  const topCenter = positions.length / 3;
  positions.push(0, options.height * (1 + random() * 0.015), 0);
  appendRockColor(colors, options.colors, 1, 0, phaseA);
  const topStart = (heights.length - 1) * segments;
  for (let index = 0; index < segments; index++)
    indices.push(
      topStart + index,
      topCenter,
      topStart + ((index + 1) % segments),
    );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  faceted.computeVertexNormals();
  faceted.computeBoundingSphere();
  return faceted;
}

function profileRadii(profile: MesaProfile) {
  if (profile === "butte")
    return [1.02, 1, 0.91, 0.88, 0.84, 0.79, 0.74, 0.7, 0.66, 0.63];
  if (profile === "weathered")
    return [1.08, 1.02, 0.93, 0.9, 0.82, 0.78, 0.69, 0.66, 0.57, 0.54];
  if (profile === "shelf")
    return [1.08, 1.04, 0.97, 0.99, 0.86, 0.88, 0.73, 0.75, 0.61, 0.6];
  return [1.06, 1.03, 0.94, 0.94, 0.86, 0.85, 0.76, 0.75, 0.66, 0.65];
}

function appendRockColor(
  target: number[],
  palette: DesertCanyonOptions["rock"],
  height: number,
  angle: number,
  phase: number,
) {
  const band = Math.min(
    palette.length - 1,
    Math.floor(((height * 5.4 + 0.15) % 1) * palette.length),
  );
  const base = new THREE.Color(palette[band]);
  const sunBias = 0.88 + Math.max(0, Math.cos(angle - 2.4)) * 0.13;
  const variation = 0.95 + Math.sin(height * 31 + phase) * 0.035;
  base.multiplyScalar(sunBias * variation);
  target.push(base.r, base.g, base.b);
}

function createTalus(
  feature: CanyonFeature,
  random: () => number,
  material: THREE.MeshStandardMaterial,
) {
  const count = 10 + Math.floor(random() * 11);
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  for (let index = 0; index < count; index++) {
    const angle = random() * Math.PI * 2;
    const distance = 0.86 + random() * 0.65;
    const size = 0.32 + random() ** 2 * 1.35;
    position.set(
      Math.cos(angle) * feature.width * distance,
      size * 0.34,
      Math.sin(angle) * feature.depth * distance,
    );
    euler.set(random() * 0.7, random() * Math.PI, random() * 0.45);
    rotation.setFromEuler(euler);
    scale.set(
      size * (0.8 + random()),
      size * (0.45 + random() * 0.45),
      size * (0.75 + random()),
    );
    matrix.compose(position, rotation, scale);
    rocks.setMatrixAt(index, matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  return rocks;
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
}

function hash(value: number) {
  let result = Math.imul(Math.floor(value) + 1, 0x45d9f3b);
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  return (result ^ (result >>> 16)) >>> 0;
}
