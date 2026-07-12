import * as THREE from 'three';
import { railFrameAtDistance, railOffsetPosition } from '../sim/railSystem';
import type { WorldAttachContext, WorldRenderContext, WorldStepContext, WorldSystem, WorldSystemDefinition } from './worldSystem';
import { removeWhere } from '../core/collections';
import { mulberry32 } from '../core/random';

const STREAM_AHEAD = 290;
const CLEANUP_MARGIN = 80;

export type AsteroidProfile = 'monolith' | 'shard' | 'binary' | 'cratered';

type AsteroidFeature = {
  id: number;
  railDistance: number;
  offsetX: number;
  offsetY: number;
  radius: number;
  profile: AsteroidProfile;
  seed: number;
};

export type AsteroidBeltOptions = {
  rock: readonly [number, number, number];
  dust: number;
};

export class AsteroidBeltSystem implements WorldSystem {
  readonly id = 'asteroid-belt';
  readonly features: AsteroidFeature[] = [];
  private readonly views = new Map<number, THREE.Group>();
  private readonly material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    flatShading: true,
    emissive: 0x101723,
    emissiveIntensity: 0.42,
  });
  private scene?: THREE.Scene;
  private stars?: THREE.Points;
  private nextDistance = 20;

  constructor(private readonly options: AsteroidBeltOptions) {}

  step(context: WorldStepContext) {
    while (this.nextDistance <= context.railDistance + STREAM_AHEAD) {
      const seed = hash(Math.floor(this.nextDistance * 19));
      const random = mulberry32(seed);
      const count = 2 + Math.floor(random() * 3);
      for (let index = 0; index < count; index++) {
        const angle = random() * Math.PI * 2;
        const distance = 20 + random() * 24;
        const verticalBias = index === 0 ? (random() < 0.5 ? -1 : 1) * (14 + random() * 18) : Math.sin(angle) * distance;
        this.features.push({
          id: context.allocateId(),
          railDistance: this.nextDistance + index * 7 + random() * 5,
          offsetX: Math.cos(angle) * distance,
          offsetY: verticalBias,
          radius: 3.8 + random() ** 1.7 * 10,
          profile: (['monolith', 'shard', 'binary', 'cratered'] as const)[Math.floor(random() * 4)],
          seed: hash(seed + index * 101),
        });
      }
      this.nextDistance += 24 + Math.floor(random() * 10);
    }
    removeWhere(this.features, (feature) => feature.railDistance < context.railDistance - CLEANUP_MARGIN);
  }

  attach({ scene }: WorldAttachContext) {
    this.scene = scene;
    this.stars = createStarField(this.options.dust);
    scene.add(this.stars);
  }

  render({ centerX, centerZ, time }: WorldRenderContext) {
    if (!this.scene || !this.stars) return;
    this.stars.position.set(centerX, 0, centerZ);
    this.stars.rotation.y = time * 0.002;
    const live = new Set(this.features.map((feature) => feature.id));
    for (const [id, view] of this.views) if (!live.has(id)) {
      this.scene.remove(view);
      disposeGroup(view);
      this.views.delete(id);
    }
    for (const feature of this.features) {
      let view = this.views.get(feature.id);
      if (!view) {
        view = createAsteroidFormation(feature, this.options.rock, this.material);
        this.views.set(feature.id, view);
        this.scene.add(view);
      }
      const position = railOffsetPosition(feature.railDistance, feature.offsetX, feature.offsetY);
      const rail = railFrameAtDistance(feature.railDistance);
      view.position.set(position.x, position.y, position.z);
      view.rotation.y = -rail.heading + time * (0.025 + (feature.seed % 7) * 0.004);
      view.rotation.x = time * (0.012 + (feature.seed % 5) * 0.003);
    }
  }

  dispose() {
    for (const view of this.views.values()) disposeGroup(view);
    if (this.stars) {
      this.stars.geometry.dispose();
      if (this.stars.material instanceof THREE.Material) this.stars.material.dispose();
      this.scene?.remove(this.stars);
    }
    this.material.dispose();
    this.views.clear();
    this.scene = undefined;
    this.stars = undefined;
  }
}

export function asteroidBelt(options: AsteroidBeltOptions): WorldSystemDefinition {
  return { create: () => new AsteroidBeltSystem(options) };
}

type AsteroidGeometryOptions = {
  seed: number;
  radius: number;
  profile: AsteroidProfile;
  colors: AsteroidBeltOptions['rock'];
  detail?: number;
};

export function createAsteroidGeometry(options: AsteroidGeometryOptions) {
  const random = mulberry32(hash(options.seed));
  const geometry = new THREE.IcosahedronGeometry(options.radius, options.detail ?? 2);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors: number[] = [];
  const phase = [random() * 8, random() * 8, random() * 8];
  const craterCount = options.profile === 'cratered' ? 5 : 2 + Math.floor(random() * 2);
  const craters = Array.from({ length: craterCount }, () => ({
    direction: new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize(),
    width: 0.16 + random() * 0.2,
    depth: 0.12 + random() * 0.15,
  }));
  const scale = profileScale(options.profile, random);
  const vertex = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    vertex.fromBufferAttribute(positions, index).normalize();
    const broadNoise = Math.sin(vertex.x * 3.1 + phase[0]) * Math.sin(vertex.y * 3.7 + phase[1])
      + Math.sin(vertex.z * 5.3 + phase[2]) * 0.55;
    let displacement = 1 + broadNoise * 0.105;
    for (const crater of craters) {
      const distance = 1 - vertex.dot(crater.direction);
      const bowl = Math.exp(-Math.pow(distance / crater.width, 2));
      const rim = Math.exp(-Math.pow((distance - crater.width * 0.82) / (crater.width * 0.24), 2));
      displacement += rim * crater.depth * 0.28 - bowl * crater.depth;
    }
    vertex.multiply(new THREE.Vector3(scale.x, scale.y, scale.z)).multiplyScalar(options.radius * displacement);
    positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
    const light = 0.78 + Math.max(0, vertex.clone().normalize().dot(new THREE.Vector3(-0.5, 0.45, 0.72))) * 0.26;
    const color = new THREE.Color(options.colors[(index + options.seed) % options.colors.length]).multiplyScalar(light);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createAsteroidFormation(feature: AsteroidFeature, colors: AsteroidBeltOptions['rock'], material: THREE.Material) {
  const group = new THREE.Group();
  const random = mulberry32(feature.seed);
  group.add(new THREE.Mesh(createAsteroidGeometry({
    seed: feature.seed,
    radius: feature.radius,
    profile: feature.profile,
    colors,
  }), material));

  if (feature.profile === 'binary') {
    const partnerRadius = feature.radius * (0.48 + random() * 0.24);
    const partner = new THREE.Mesh(createAsteroidGeometry({
      seed: hash(feature.seed + 17), radius: partnerRadius, profile: 'monolith', colors, detail: 1,
    }), material);
    partner.position.set(feature.radius * 0.9, feature.radius * 0.16, 0);
    partner.rotation.z = random() * Math.PI;
    group.add(partner);
  }

  const fragmentCount = 2 + Math.floor(random() * 5);
  for (let index = 0; index < fragmentCount; index++) {
    const fragmentRadius = feature.radius * (0.07 + random() * 0.09);
    const fragment = new THREE.Mesh(createAsteroidGeometry({
      seed: hash(feature.seed + 41 + index), radius: fragmentRadius, profile: 'shard', colors, detail: 0,
    }), material);
    const direction = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize();
    fragment.position.copy(direction.multiplyScalar(feature.radius * (1.2 + random() * 0.9)));
    fragment.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    group.add(fragment);
  }
  return group;
}

function profileScale(profile: AsteroidProfile, random: () => number) {
  if (profile === 'shard') return new THREE.Vector3(1.65 + random() * 0.45, 0.48 + random() * 0.18, 0.72 + random() * 0.2);
  if (profile === 'monolith') return new THREE.Vector3(0.78 + random() * 0.22, 1.35 + random() * 0.4, 0.82 + random() * 0.25);
  return new THREE.Vector3(0.86 + random() * 0.3, 0.8 + random() * 0.35, 0.88 + random() * 0.28);
}

function createStarField(color: number) {
  const random = mulberry32(0x5a17c9);
  const positions: number[] = [];
  for (let index = 0; index < 750; index++) {
    const direction = new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize();
    direction.multiplyScalar(180 + random() * 170);
    positions.push(direction.x, direction.y, direction.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 0.65, sizeAttenuation: true, transparent: true, opacity: 0.72, depthWrite: false }));
}

function hash(value: number) {
  value = Math.imul(value ^ value >>> 16, 0x21f0aaad);
  value = Math.imul(value ^ value >>> 15, 0x735a2d97);
  return (value ^ value >>> 15) >>> 0;
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
}
