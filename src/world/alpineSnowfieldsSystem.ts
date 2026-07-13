import * as THREE from "three";
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

const STREAM_AHEAD = 280;
const CLEANUP_MARGIN = 75;

export type AlpineProfile = "horn" | "ridge" | "cirque" | "shoulder";

type AlpineFeature = {
  id: number;
  railDistance: number;
  side: -1 | 1;
  offset: number;
  width: number;
  height: number;
  depth: number;
  profile: AlpineProfile;
  seed: number;
  trees: number;
};

type AlpineLake = {
  id: number;
  railDistance: number;
  offset: number;
  radiusX: number;
  radiusZ: number;
  rotation: number;
  seed: number;
};

export type AlpineSnowfieldsOptions = {
  snow: readonly [number, number, number];
  rock: readonly [number, number, number];
  ice: number;
  evergreen: number;
};

export class AlpineSnowfieldsSystem implements WorldSystem {
  readonly id = "alpine-snowfields";
  readonly features: AlpineFeature[] = [];
  readonly lakes: AlpineLake[] = [];
  private readonly views = new Map<number, THREE.Group>();
  private readonly lakeViews = new Map<number, THREE.Group>();
  private readonly mountainMaterial: THREE.MeshStandardMaterial;
  private readonly groundMaterial: THREE.MeshStandardMaterial;
  private readonly iceMaterial: THREE.MeshStandardMaterial;
  private readonly treeMaterial: THREE.MeshStandardMaterial;
  private readonly trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x473c38,
    roughness: 1,
    flatShading: true,
  });
  private scene?: THREE.Scene;
  private ground?: THREE.Mesh;
  private snowfall?: THREE.Points;
  private nextDistance = 20;

  constructor(private readonly options: AlpineSnowfieldsOptions) {
    this.mountainMaterial = createAlpineSurfaceMaterial(options, false);
    this.groundMaterial = createAlpineSurfaceMaterial(options, true);
    this.iceMaterial = new THREE.MeshStandardMaterial({
      color: options.ice,
      roughness: 0.28,
      metalness: 0.08,
      transparent: true,
      opacity: 0.9,
    });
    this.treeMaterial = new THREE.MeshStandardMaterial({
      color: options.evergreen,
      roughness: 1,
      flatShading: true,
    });
  }

  step(context: WorldStepContext) {
    while (this.nextDistance <= context.railDistance + STREAM_AHEAD) {
      const seed = hash(Math.floor(this.nextDistance * 23));
      for (const side of [-1, 1] as const) {
        const sideSeed = hash(seed + (side === 1 ? 193 : 0));
        const random = mulberry32(sideSeed);
        this.features.push({
          id: context.allocateId(),
          railDistance: this.nextDistance + (side === 1 ? 8 : 0),
          side,
          offset: 31 + random() * 14,
          width: 15 + random() * 12,
          height: 15 + random() * 20,
          depth: 18 + random() * 16,
          profile: (["horn", "ridge", "cirque", "shoulder"] as const)[
            Math.floor(random() * 4)
          ],
          seed: sideSeed,
          trees: sideSeed % 3 === 0 ? 3 + Math.floor(random() * 5) : 0,
        });
      }
      if (seed % 3 === 0) {
        const random = mulberry32(hash(seed + 811));
        this.lakes.push({
          id: context.allocateId(),
          railDistance: this.nextDistance + 14 + random() * 8,
          offset: (random() < 0.5 ? -1 : 1) * (10 + random() * 7),
          radiusX: 6 + random() * 5,
          radiusZ: 9 + random() * 8,
          rotation: (random() - 0.5) * 0.55,
          seed: hash(seed + 1291),
        });
      }
      this.nextDistance += 34;
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
    this.ground = new THREE.Mesh(
      createSnowfieldGeometry(),
      this.groundMaterial,
    );
    this.ground.frustumCulled = false;
    this.ground.position.y = GROUND_SURFACE_Y;
    scene.add(this.ground);
    this.snowfall = createSnowfall(this.options.snow[0]);
    scene.add(this.snowfall);
  }

  render({ centerX, centerZ, time }: WorldRenderContext) {
    if (!this.scene || !this.ground || !this.snowfall) return;
    this.ground.position.x = centerX;
    this.ground.position.z = centerZ;
    updateAlpineMaterial(this.groundMaterial, time, centerX, centerZ);
    updateAlpineMaterial(this.mountainMaterial, time, centerX, centerZ);
    this.snowfall.position.set(centerX, 9, centerZ);
    this.snowfall.rotation.y = time * 0.015;

    const live = new Set(this.features.map((feature) => feature.id));
    for (const [id, view] of this.views) {
      if (live.has(id)) continue;
      view.removeFromParent();
      disposeGroup(view);
      this.views.delete(id);
    }

    for (const feature of this.features) {
      let view = this.views.get(feature.id);
      if (!view) {
        view = createAlpineFormation(feature, this.options, {
          mountain: this.mountainMaterial,
          tree: this.treeMaterial,
          trunk: this.trunkMaterial,
        });
        this.views.set(feature.id, view);
        this.scene.add(view);
      }
      const position = railOffsetPosition(
        feature.railDistance,
        feature.side * feature.offset,
        GROUND_SURFACE_Y,
      );
      const rail = railFrameAtDistance(feature.railDistance);
      view.position.set(
        position.x,
        position.y + snowfieldHeight(position.x, position.z) - 0.65,
        position.z,
      );
      view.rotation.y = -rail.heading;
    }

    const liveLakes = new Set(this.lakes.map((lake) => lake.id));
    for (const [id, view] of this.lakeViews) {
      if (liveLakes.has(id)) continue;
      view.removeFromParent();
      disposeGroup(view);
      this.lakeViews.delete(id);
    }
    for (const lake of this.lakes) {
      let view = this.lakeViews.get(lake.id);
      if (!view) {
        view = createLakeBasin(lake, this.iceMaterial, this.mountainMaterial);
        this.lakeViews.set(lake.id, view);
        this.scene.add(view);
      }
      const position = railOffsetPosition(
        lake.railDistance,
        lake.offset,
        GROUND_SURFACE_Y,
      );
      const rail = railFrameAtDistance(lake.railDistance);
      view.position.set(
        position.x,
        position.y + snowfieldHeight(position.x, position.z) + 0.52,
        position.z,
      );
      view.rotation.y = -rail.heading + lake.rotation;
    }
  }

  getCollidableObjects() {
    return [...this.views.values()];
  }

  dispose() {
    for (const view of this.views.values()) disposeGroup(view);
    this.views.clear();
    for (const view of this.lakeViews.values()) disposeGroup(view);
    this.lakeViews.clear();
    if (this.ground) {
      this.ground.removeFromParent();
      this.ground.geometry.dispose();
    }
    if (this.snowfall) {
      this.snowfall.removeFromParent();
      this.snowfall.geometry.dispose();
      if (this.snowfall.material instanceof THREE.Material)
        this.snowfall.material.dispose();
    }
    this.mountainMaterial.dispose();
    this.groundMaterial.dispose();
    this.iceMaterial.dispose();
    this.treeMaterial.dispose();
    this.trunkMaterial.dispose();
    this.scene = undefined;
    this.ground = undefined;
    this.snowfall = undefined;
  }
}

export function alpineSnowfields(
  options: AlpineSnowfieldsOptions,
): WorldSystemDefinition {
  return { create: () => new AlpineSnowfieldsSystem(options) };
}

type AlpineGeometryOptions = {
  seed: number;
  width: number;
  height: number;
  depth: number;
  profile: AlpineProfile;
  snow: AlpineSnowfieldsOptions["snow"];
  rock: AlpineSnowfieldsOptions["rock"];
  segments?: number;
};

export function createAlpineGeometry(options: AlpineGeometryOptions) {
  const segments = options.segments ?? 20;
  const random = mulberry32(hash(options.seed));
  const phaseA = random() * Math.PI * 2;
  const phaseB = random() * Math.PI * 2;
  const positions: number[] = [];
  const indices: number[] = [];
  const peaks = alpinePeaks(options.profile, random);

  for (let zIndex = 0; zIndex <= segments; zIndex++) {
    const v = (zIndex / segments) * 2 - 1;
    for (let xIndex = 0; xIndex <= segments; xIndex++) {
      const u = (xIndex / segments) * 2 - 1;
      const edge = Math.max(Math.abs(u), Math.abs(v));
      const edgeBlend = 1 - THREE.MathUtils.smoothstep(edge, 0.72, 1);
      let massif = 0;
      for (const peak of peaks) {
        const dx = (u - peak.x) / peak.width;
        const dz = (v - peak.z) / peak.depth;
        const distance = Math.sqrt(dx * dx + dz * dz);
        const pointed = Math.max(0, 1 - distance);
        massif = Math.max(
          massif,
          Math.pow(pointed, peak.sharpness) * peak.height,
        );
      }
      const ridge =
        options.profile === "ridge"
          ? Math.max(
              0,
              1 - Math.abs(v * 1.25 + Math.sin(u * 4 + phaseA) * 0.12),
            ) *
            Math.max(0, 1 - Math.abs(u) * 0.72) *
            0.28
          : 0;
      const cirque =
        options.profile === "cirque"
          ? 1 -
            Math.exp(
              -(Math.pow((u - 0.08) / 0.36, 2) + Math.pow((v + 0.04) / 0.3, 2)),
            ) *
              0.42
          : 1;
      const broadNoise =
        Math.sin(u * 7.2 + phaseA) * 0.055 +
        Math.sin(v * 8.8 + phaseB) * 0.045 +
        Math.sin((u + v) * 13.4 + phaseA * 0.7) * 0.028;
      const erosion =
        0.88 + Math.abs(Math.sin(u * 12.7 + v * 7.1 + phaseB)) * 0.14;
      const height =
        Math.max(0, massif + ridge + broadNoise * Math.max(massif, 0.16)) *
        cirque *
        erosion *
        edgeBlend;
      const skirt = (1 - edgeBlend) * 1.15;
      positions.push(
        u * options.width,
        height * options.height - skirt,
        v * options.depth,
      );
    }
  }

  const stride = segments + 1;
  for (let zIndex = 0; zIndex < segments; zIndex++) {
    for (let xIndex = 0; xIndex < segments; xIndex++) {
      const a = zIndex * stride + xIndex;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if ((xIndex + zIndex) % 2 === 0) indices.push(a, c, b, b, c, d);
      else indices.push(a, d, b, a, c, d);
    }
  }

  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  indexed.setIndex(indices);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.computeVertexNormals();
  applyAlpineColors(geometry, options);
  geometry.computeBoundingSphere();
  return geometry;
}

function alpinePeaks(profile: AlpineProfile, random: () => number) {
  const count = profile === "ridge" ? 4 : profile === "shoulder" ? 3 : 2;
  return Array.from({ length: count }, (_, index) => ({
    x:
      profile === "ridge"
        ? -0.55 + (index / Math.max(1, count - 1)) * 1.1
        : (random() - 0.5) * 0.7,
    z: profile === "ridge" ? (random() - 0.5) * 0.22 : (random() - 0.5) * 0.62,
    width: (profile === "shoulder" ? 0.7 : 0.42) + random() * 0.23,
    depth: (profile === "ridge" ? 0.48 : 0.4) + random() * 0.28,
    height: (index === 0 ? 0.9 : 0.58) + random() * (index === 0 ? 0.22 : 0.3),
    sharpness: profile === "horn" ? 1.5 : 1.08 + random() * 0.26,
  }));
}

function applyAlpineColors(
  geometry: THREE.BufferGeometry,
  options: AlpineGeometryOptions,
) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const colors: number[] = [];
  for (let index = 0; index < position.count; index++) {
    const height = position.getY(index) / options.height;
    const upward = Math.max(0, normal.getY(index));
    const noise = Math.sin(index * 0.77 + options.seed) * 0.5 + 0.5;
    const snowCover = snowCoverageForSlope(upward, height, noise);
    const palette = snowCover > 0.52 ? options.snow : options.rock;
    const paletteIndex = Math.min(
      palette.length - 1,
      Math.floor((height * 3.7 + upward * 1.8 + index * 0.07) % palette.length),
    );
    const color = new THREE.Color(palette[paletteIndex]);
    color.multiplyScalar(0.83 + upward * 0.17);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}

export function snowCoverageForSlope(
  upwardNormal: number,
  relativeHeight: number,
  noise: number,
) {
  const deposition = upwardNormal * 0.92 + relativeHeight * 0.16 + noise * 0.1;
  return THREE.MathUtils.smoothstep(deposition, 0.48, 0.76);
}

function createAlpineSurfaceMaterial(
  options: AlpineSnowfieldsOptions,
  displaceGround: boolean,
) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0,
    flatShading: true,
  });
  const terrainCenter = new THREE.Vector2();
  material.userData.alpineTime = 0;
  material.userData.terrainCenter = terrainCenter;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAlpineTime = { value: material.userData.alpineTime };
    shader.uniforms.uTerrainCenter = { value: terrainCenter };
    shader.uniforms.uSnowA = { value: new THREE.Color(options.snow[0]) };
    shader.uniforms.uSnowB = { value: new THREE.Color(options.snow[2]) };
    shader.uniforms.uRockA = { value: new THREE.Color(options.rock[0]) };
    shader.uniforms.uRockB = { value: new THREE.Color(options.rock[2]) };
    material.userData.shader = shader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
      uniform vec2 uTerrainCenter;
      varying vec3 vAlpineWorldPosition;
      varying vec3 vAlpineWorldNormal;
      float alpineGroundHeight(vec2 point) {
        float broad = sin(point.x * 0.022) * 0.72
          + sin(point.y * 0.027 + point.x * 0.011) * 0.58
          + sin((point.x - point.y) * 0.048) * 0.27;
        float ridges = pow(abs(sin(point.x * 0.036 + point.y * 0.019)), 2.4) * 0.52;
        float drifts = sin(point.x * 0.12 + sin(point.y * 0.033) * 2.0) * 0.13;
        return broad + ridges + drifts;
      }`,
    );
    if (displaceGround) {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <beginnormal_vertex>",
          `vec2 alpinePoint = position.xz + uTerrainCenter;
          float alpineEpsilon = 0.45;
          float alpineLeft = alpineGroundHeight(alpinePoint - vec2(alpineEpsilon, 0.0));
          float alpineRight = alpineGroundHeight(alpinePoint + vec2(alpineEpsilon, 0.0));
          float alpineDown = alpineGroundHeight(alpinePoint - vec2(0.0, alpineEpsilon));
          float alpineUp = alpineGroundHeight(alpinePoint + vec2(0.0, alpineEpsilon));
          vec3 objectNormal = normalize(vec3(
            alpineLeft - alpineRight,
            alpineEpsilon * 2.0,
            alpineDown - alpineUp
          ));`,
        )
        .replace(
          "#include <begin_vertex>",
          `vec3 transformed = vec3(
            position.x,
            alpineGroundHeight(position.xz + uTerrainCenter),
            position.z
          );
          vAlpineWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
          vAlpineWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
    } else {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
        vAlpineWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        vAlpineWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uAlpineTime;
        uniform vec3 uSnowA;
        uniform vec3 uSnowB;
        uniform vec3 uRockA;
        uniform vec3 uRockB;
        varying vec3 vAlpineWorldPosition;
        varying vec3 vAlpineWorldNormal;

        float alpineHash(vec2 point) {
          point = fract(point * vec2(123.34, 456.21));
          point += dot(point, point + 45.32);
          return fract(point.x * point.y);
        }

        float alpineNoise(vec2 point) {
          vec2 cell = floor(point);
          vec2 local = fract(point);
          local = local * local * (3.0 - 2.0 * local);
          return mix(
            mix(alpineHash(cell), alpineHash(cell + vec2(1.0, 0.0)), local.x),
            mix(alpineHash(cell + vec2(0.0, 1.0)), alpineHash(cell + vec2(1.0)), local.x),
            local.y
          );
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `vec3 alpineWorldNormal = normalize(vAlpineWorldNormal);
        float alpineMineral = alpineNoise(vAlpineWorldPosition.xz * 0.19)
          * 0.58 + alpineNoise(vAlpineWorldPosition.zy * 0.43 + 17.0) * 0.42;
        float alpineFineSnow = alpineNoise(vAlpineWorldPosition.xz * 0.72 + 31.0);
        float alpineHeightBias = clamp((vAlpineWorldPosition.y + 3.0) / 32.0, 0.0, 1.0);
        float alpineDeposition = alpineWorldNormal.y * 0.96
          + alpineHeightBias * 0.10 + alpineFineSnow * 0.08;
        float alpineSnowCover = smoothstep(0.52, 0.78, alpineDeposition);
        float alpineStrata = 0.88 + sin(vAlpineWorldPosition.y * 2.8 + alpineMineral * 5.0) * 0.08;
        vec3 alpineRock = mix(uRockA, uRockB, alpineMineral) * alpineStrata;
        vec3 alpineSnow = mix(uSnowB, uSnowA, 0.7 + alpineFineSnow * 0.3);
        alpineSnow *= 0.94 + alpineFineSnow * 0.08;
        diffuseColor.rgb = mix(alpineRock, alpineSnow, alpineSnowCover);
        float alpineSparkleSeed = alpineHash(
          floor(vAlpineWorldPosition.xz * 5.2) + floor(uAlpineTime * 1.7)
        );
        float alpineSparkle = step(0.997, alpineSparkleSeed)
          * alpineSnowCover * max(alpineWorldNormal.y, 0.0);
        diffuseColor.rgb += alpineSparkle * vec3(0.22, 0.3, 0.36);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.88, 0.97, alpineSnowCover);`,
      );
  };
  material.customProgramCacheKey = () =>
    displaceGround ? "alpine-ground-v2" : "alpine-mountain-v2";
  return material;
}

function updateAlpineMaterial(
  material: THREE.MeshStandardMaterial,
  time: number,
  centerX: number,
  centerZ: number,
) {
  material.userData.alpineTime = time;
  (material.userData.terrainCenter as THREE.Vector2).set(centerX, centerZ);
  const shader = material.userData.shader as
    { uniforms: Record<string, { value: unknown }> } | undefined;
  if (shader) shader.uniforms.uAlpineTime.value = time;
}

function createAlpineFormation(
  feature: AlpineFeature,
  options: AlpineSnowfieldsOptions,
  materials: {
    mountain: THREE.Material;
    tree: THREE.Material;
    trunk: THREE.Material;
  },
) {
  const group = new THREE.Group();
  const random = mulberry32(feature.seed);
  group.add(
    new THREE.Mesh(
      createAlpineGeometry({
        seed: feature.seed,
        width: feature.width,
        height: feature.height,
        depth: feature.depth,
        profile: feature.profile,
        snow: options.snow,
        rock: options.rock,
      }),
      materials.mountain,
    ),
  );

  const satelliteCount = 1 + Math.floor(random() * 3);
  for (let index = 0; index < satelliteCount; index++) {
    const scale = 0.24 + random() * 0.24;
    const satellite = new THREE.Mesh(
      createAlpineGeometry({
        seed: hash(feature.seed + index * 71),
        width: feature.width * scale,
        height: feature.height * (0.32 + random() * 0.3),
        depth: feature.depth * scale,
        profile: random() > 0.5 ? "horn" : "shoulder",
        snow: options.snow,
        rock: options.rock,
        segments: 10,
      }),
      materials.mountain,
    );
    const angle = random() * Math.PI * 2;
    satellite.position.set(
      Math.cos(angle) * feature.width * (0.72 + random() * 0.34),
      0,
      Math.sin(angle) * feature.depth * (0.65 + random() * 0.35),
    );
    group.add(satellite);
  }

  if (feature.trees > 0)
    group.add(
      createTreeCluster(feature, random, materials.tree, materials.trunk),
    );
  group.add(createTalus(feature, random, materials.mountain));
  return group;
}

function createTreeCluster(
  feature: AlpineFeature,
  random: () => number,
  treeMaterial: THREE.Material,
  trunkMaterial: THREE.Material,
) {
  const group = new THREE.Group();
  const crownGeometry = new THREE.ConeGeometry(1, 3.2, 6, 2);
  const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.18, 1.15, 5);
  for (let index = 0; index < feature.trees; index++) {
    const tree = new THREE.Group();
    const height = 1.4 + random() * 1.8;
    const crown = new THREE.Mesh(crownGeometry, treeMaterial);
    crown.position.y = height * 0.72;
    crown.scale.setScalar(height * 0.48);
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = height * 0.23;
    trunk.scale.setScalar(height * 0.48);
    tree.add(trunk, crown);
    const angle = random() * Math.PI * 2;
    tree.position.set(
      Math.cos(angle) * feature.width * (0.85 + random() * 0.35),
      0,
      Math.sin(angle) * feature.depth * (0.72 + random() * 0.42),
    );
    group.add(tree);
  }
  return group;
}

function createTalus(
  feature: AlpineFeature,
  random: () => number,
  material: THREE.Material,
) {
  const count = 6 + Math.floor(random() * 9);
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  for (let index = 0; index < count; index++) {
    const angle = random() * Math.PI * 2;
    const size = 0.28 + random() ** 2 * 1.2;
    position.set(
      Math.cos(angle) * feature.width * (0.75 + random() * 0.65),
      size * 0.35,
      Math.sin(angle) * feature.depth * (0.72 + random() * 0.65),
    );
    euler.set(random(), random() * Math.PI, random());
    rotation.setFromEuler(euler);
    scale.set(size * (0.7 + random()), size * (0.45 + random() * 0.4), size);
    matrix.compose(position, rotation, scale);
    rocks.setMatrixAt(index, matrix);
  }
  rocks.instanceMatrix.needsUpdate = true;
  return rocks;
}

function createLakeBasin(
  lake: AlpineLake,
  iceMaterial: THREE.Material,
  snowMaterial: THREE.Material,
) {
  const group = new THREE.Group();
  const random = mulberry32(lake.seed);
  const snowBank = new THREE.Mesh(
    createLakeShapeGeometry(lake.seed, true),
    snowMaterial,
  );
  snowBank.rotation.x = -Math.PI / 2;
  snowBank.scale.set(lake.radiusX, lake.radiusZ, 1);
  snowBank.position.y = 0.06;
  group.add(snowBank);

  const ice = new THREE.Mesh(
    createLakeShapeGeometry(lake.seed, false),
    iceMaterial,
  );
  ice.rotation.x = -Math.PI / 2;
  ice.scale.set(lake.radiusX * 0.94, lake.radiusZ * 0.94, 1);
  group.add(ice);

  for (let index = 0; index < 4; index++) {
    const floe = new THREE.Mesh(new THREE.CircleGeometry(1, 7), snowMaterial);
    floe.rotation.x = -Math.PI / 2;
    floe.rotation.z = random() * Math.PI;
    const angle = random() * Math.PI * 2;
    const distance = 0.3 + random() * 0.48;
    floe.position.set(
      Math.cos(angle) * lake.radiusX * distance,
      0.035,
      Math.sin(angle) * lake.radiusZ * distance,
    );
    const scale = 0.35 + random() * 0.65;
    floe.scale.set(scale * 1.35, scale, 1);
    group.add(floe);
  }
  return group;
}

function createLakeShapeGeometry(seed: number, bank: boolean) {
  const random = mulberry32(hash(seed + 733));
  const segments = 28;
  const radii = Array.from({ length: segments }, () => 0.93 + random() * 0.12);
  const points = radii.map((radius, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return new THREE.Vector2(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
    );
  });
  const shape = new THREE.Shape(points);
  if (bank) {
    const holePoints = radii.map((radius, index) => {
      const reversed = segments - 1 - index;
      const angle = (reversed / segments) * Math.PI * 2;
      return new THREE.Vector2(
        Math.cos(angle) * radius * 0.82,
        Math.sin(angle) * radius * 0.82,
      );
    });
    shape.holes.push(new THREE.Path(holePoints));
  }
  return new THREE.ShapeGeometry(shape);
}

function createSnowfieldGeometry() {
  const geometry = new THREE.PlaneGeometry(540, 540, 72, 72);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function snowfieldHeight(x: number, z: number) {
  const broad =
    Math.sin(x * 0.022) * 0.72 +
    Math.sin(z * 0.027 + x * 0.011) * 0.58 +
    Math.sin((x - z) * 0.048) * 0.27;
  const ridges = Math.abs(Math.sin(x * 0.036 + z * 0.019)) ** 2.4 * 0.52;
  const drifts = Math.sin(x * 0.12 + Math.sin(z * 0.033) * 2) * 0.13;
  return broad + ridges + drifts;
}

function createSnowfall(color: number) {
  const random = mulberry32(0xa11f1e);
  const positions: number[] = [];
  for (let index = 0; index < 480; index++)
    positions.push(
      (random() - 0.5) * 190,
      (random() - 0.5) * 55,
      (random() - 0.5) * 190,
    );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  const material = new THREE.PointsMaterial({
    color,
    size: 0.16,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return new THREE.Points(geometry, material);
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh)
      object.geometry.dispose();
  });
  group.removeFromParent();
}

function hash(value: number) {
  let result = Math.imul(Math.floor(value) + 1, 0x45d9f3b);
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  return (result ^ (result >>> 16)) >>> 0;
}
