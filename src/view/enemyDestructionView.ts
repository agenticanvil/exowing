import * as THREE from "three";
import type { EnemyDestructionState, Vec3 } from "../sim/types";

type DestructionSource = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  baseRadius: number;
  fragmentCount: number;
};

type FragmentTemplate = {
  geometry: THREE.BufferGeometry;
  center: THREE.Vector3;
};

type DestructionTemplate = Omit<DestructionSource, "geometry"> & {
  fragments: FragmentTemplate[];
};

type FragmentView = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
};

type ParticleView = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  origins: Float32Array;
  velocities: Float32Array;
};

type DestructionEffect = {
  root: THREE.Group;
  fragments: FragmentView[];
  sparks: ParticleView;
  smoke: ParticleView;
  flash: THREE.Sprite;
  age: number;
  duration: number;
  scale: number;
  smokeBaseSize: number;
  flashBaseSize: number;
};

const UP = new THREE.Vector3(0, 1, 0);
const lookAtMatrix = new THREE.Matrix4();
const lookAtTarget = new THREE.Vector3();

export class EnemyDestructionView {
  private readonly templates: Record<"standard" | "boss", DestructionTemplate>;
  private readonly effects = new Map<number, DestructionEffect>();
  private readonly seen = new Set<number>();
  private readonly particleTexture = createParticleTexture();

  constructor(
    private readonly scene: THREE.Scene,
    sources: Record<"standard" | "boss", DestructionSource>,
  ) {
    this.templates = {
      standard: createTemplate(sources.standard),
      boss: createTemplate(sources.boss),
    };
  }

  sync(
    states: readonly EnemyDestructionState[],
    playerPosition: Vec3,
    dt: number,
  ) {
    for (const state of states) {
      if (this.seen.has(state.id)) continue;
      this.seen.add(state.id);
      this.effects.set(state.id, this.createEffect(state, playerPosition));
    }

    for (const [id, effect] of this.effects) {
      effect.age += dt;
      if (effect.age >= effect.duration) {
        this.disposeEffect(effect);
        this.effects.delete(id);
        continue;
      }
      updateEffect(effect);
    }
  }

  dispose() {
    for (const effect of this.effects.values()) this.disposeEffect(effect);
    for (const template of Object.values(this.templates)) {
      for (const fragment of template.fragments) fragment.geometry.dispose();
      template.material.dispose();
    }
    this.particleTexture.dispose();
    this.effects.clear();
    this.seen.clear();
  }

  private createEffect(state: EnemyDestructionState, playerPosition: Vec3) {
    const template = this.templates[state.kind];
    const scale = state.radius / template.baseRadius;
    const random = seededRandom(state.id * 0x9e3779b1);
    const root = new THREE.Group();
    root.position.set(state.position.x, state.position.y, state.position.z);
    lookAtTarget.set(playerPosition.x, playerPosition.y, playerPosition.z);
    lookAtMatrix.lookAt(root.position, lookAtTarget, UP);
    root.quaternion.setFromRotationMatrix(lookAtMatrix);
    root.scale.setScalar(scale);

    const fragmentMaterial = template.material.clone();
    fragmentMaterial.transparent = true;
    const fragments = template.fragments.map((fragment) => {
      const mesh = new THREE.Mesh(fragment.geometry, fragmentMaterial);
      const outward = fragment.center.clone().normalize();
      outward.x += (random() - 0.5) * 0.55;
      outward.y += (random() - 0.3) * 0.55;
      outward.z += (random() - 0.5) * 0.55;
      outward.normalize();
      const worldSpeed = 5 + random() * 7 + state.radius * 0.7;
      const velocity = outward.multiplyScalar(
        worldSpeed / Math.max(scale, 0.01),
      );
      const spin = new THREE.Vector3(
        random() - 0.5,
        random() - 0.5,
        random() - 0.5,
      )
        .normalize()
        .multiplyScalar(5 + random() * 8);
      root.add(mesh);
      return { mesh, velocity, spin };
    });

    const sparks = createParticles(
      state.kind === "boss" ? 52 : 28,
      state.radius,
      scale,
      random,
      new THREE.PointsMaterial({
        map: this.particleTexture,
        color: 0xff6a18,
        size: state.kind === "boss" ? 0.8 / scale : 0.55 / scale,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
      9,
      19,
    );
    const smokeBaseSize = state.kind === "boss" ? 3.4 / scale : 1.9 / scale;
    const smoke = createParticles(
      state.kind === "boss" ? 28 : 15,
      state.radius * 0.45,
      scale,
      random,
      new THREE.PointsMaterial({
        map: this.particleTexture,
        color: 0x29272a,
        size: smokeBaseSize,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
      0.7,
      3.2,
      1.8,
    );
    root.add(sparks.points, smoke.points);

    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.particleTexture,
        color: 0xff8a24,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const flashBaseSize = (state.kind === "boss" ? 8 : 4.5) / scale;
    flash.scale.setScalar(flashBaseSize);
    root.add(flash);
    this.scene.add(root);

    return {
      root,
      fragments,
      sparks,
      smoke,
      flash,
      age: 0,
      duration: state.duration,
      scale,
      smokeBaseSize,
      flashBaseSize,
    } satisfies DestructionEffect;
  }

  private disposeEffect(effect: DestructionEffect) {
    effect.root.removeFromParent();
    const fragmentMaterial = effect.fragments[0]?.mesh.material;
    if (fragmentMaterial instanceof THREE.Material) fragmentMaterial.dispose();
    effect.sparks.points.geometry.dispose();
    effect.sparks.points.material.dispose();
    effect.smoke.points.geometry.dispose();
    effect.smoke.points.material.dispose();
    effect.flash.material.dispose();
  }
}

function createTemplate(source: DestructionSource): DestructionTemplate {
  return {
    material: source.material.clone(),
    baseRadius: source.baseRadius,
    fragmentCount: source.fragmentCount,
    fragments: splitGeometry(source.geometry, source.fragmentCount),
  };
}

function splitGeometry(geometry: THREE.BufferGeometry, count: number) {
  geometry.computeBoundingBox();
  const minY = geometry.boundingBox?.min.y ?? -1;
  const height = Math.max(0.001, (geometry.boundingBox?.max.y ?? 1) - minY);
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const triangleCount = (index?.count ?? position.count) / 3;
  const triangleIndices = Array.from({ length: count }, () => [] as number[]);
  const vertexIndex = (offset: number) => index?.getX(offset) ?? offset;

  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const a = vertexIndex(triangle * 3);
    const b = vertexIndex(triangle * 3 + 1);
    const c = vertexIndex(triangle * 3 + 2);
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const y = (position.getY(a) + position.getY(b) + position.getY(c)) / 3;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    const angleBand = Math.min(
      3,
      Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 4),
    );
    const heightBands = Math.max(1, Math.ceil(count / 4));
    const heightBand = THREE.MathUtils.clamp(
      Math.floor(((y - minY) / height) * heightBands),
      0,
      heightBands - 1,
    );
    const fragment = Math.min(count - 1, heightBand * 4 + angleBand);
    triangleIndices[fragment].push(a, b, c);
  }

  return triangleIndices
    .filter((indices) => indices.length > 0)
    .map((indices) => {
      const fragment = geometry.clone();
      fragment.clearGroups();
      fragment.setIndex(indices);
      fragment.computeBoundingBox();
      fragment.computeBoundingSphere();
      return {
        geometry: fragment,
        center: fragment.boundingBox!.getCenter(new THREE.Vector3()),
      };
    });
}

function createParticles(
  count: number,
  radius: number,
  scale: number,
  random: () => number,
  material: THREE.PointsMaterial,
  minSpeed: number,
  maxSpeed: number,
  lift = 0,
) {
  const origins = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    const offset = index * 3;
    const direction = randomDirection(random);
    const originRadius = random() * radius * 0.32;
    const speed = (minSpeed + random() * (maxSpeed - minSpeed)) / scale;
    origins[offset] = (direction.x * originRadius) / scale;
    origins[offset + 1] = (direction.y * originRadius) / scale;
    origins[offset + 2] = (direction.z * originRadius) / scale;
    velocities[offset] = direction.x * speed;
    velocities[offset + 1] = direction.y * speed + lift / scale;
    velocities[offset + 2] = direction.z * speed;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(origins.slice(), 3),
  );
  return { points: new THREE.Points(geometry, material), origins, velocities };
}

function updateEffect(effect: DestructionEffect) {
  const progress = effect.age / effect.duration;
  const fragmentFade = 1 - THREE.MathUtils.smoothstep(progress, 0.55, 1);
  const material = effect.fragments[0]?.mesh.material;
  if (material instanceof THREE.Material) material.opacity = fragmentFade;
  for (const fragment of effect.fragments) {
    fragment.mesh.position.copy(fragment.velocity).multiplyScalar(effect.age);
    fragment.mesh.position.y -= (5.5 * effect.age * effect.age) / effect.scale;
    fragment.mesh.rotation.set(
      fragment.spin.x * effect.age,
      fragment.spin.y * effect.age,
      fragment.spin.z * effect.age,
    );
  }

  updateParticles(effect.sparks, effect.age, -7 / effect.scale);
  effect.sparks.points.material.opacity =
    1 - THREE.MathUtils.smoothstep(progress, 0.22, 0.72);
  updateParticles(effect.smoke, effect.age, 0.65 / effect.scale);
  effect.smoke.points.material.opacity =
    THREE.MathUtils.smoothstep(progress, 0.02, 0.18) *
    (1 - THREE.MathUtils.smoothstep(progress, 0.48, 1));
  effect.smoke.points.material.size =
    effect.smokeBaseSize * (1 + progress * 1.8);
  effect.flash.material.opacity =
    1 - THREE.MathUtils.smoothstep(progress, 0.02, 0.32);
  effect.flash.scale.setScalar(
    effect.flashBaseSize *
      (1 + THREE.MathUtils.smoothstep(progress, 0, 0.32) * 0.75),
  );
}

function updateParticles(
  particles: ParticleView,
  age: number,
  accelerationY: number,
) {
  const position = particles.points.geometry.getAttribute("position");
  for (let index = 0; index < position.count; index++) {
    const offset = index * 3;
    position.setXYZ(
      index,
      particles.origins[offset] + particles.velocities[offset] * age,
      particles.origins[offset + 1] +
        particles.velocities[offset + 1] * age +
        0.5 * accelerationY * age * age,
      particles.origins[offset + 2] + particles.velocities[offset + 2] * age,
    );
  }
  position.needsUpdate = true;
}

function randomDirection(random: () => number) {
  const y = random() * 2 - 1;
  const angle = random() * Math.PI * 2;
  const horizontal = Math.sqrt(1 - y * y);
  return new THREE.Vector3(
    Math.cos(angle) * horizontal,
    y,
    Math.sin(angle) * horizontal,
  );
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createParticleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Unable to create destruction particle texture.");
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.32, "rgba(255,255,255,0.92)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
