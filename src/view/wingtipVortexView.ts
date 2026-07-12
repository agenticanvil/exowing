import * as THREE from "three";

const SOCKET_NAMES = ["socketwingtipvortexleft", "socketwingtipvortexright"];
const MAX_POINTS = 72;
const RADIAL_SEGMENTS = 6;
const MIN_SAMPLE_DISTANCE = 0.08;
const TELEPORT_DISTANCE = 10;
const MAX_TRAIL_LENGTH = 10;

export class WingtipVortexView {
  private readonly trails: VortexTrail[] = [];
  private elapsed = 0;

  constructor(scene: THREE.Scene, ship: THREE.Object3D) {
    const sockets = new Map<string, THREE.Object3D>();
    ship.traverse((object) => sockets.set(normalizeName(object.name), object));
    for (const name of SOCKET_NAMES) {
      const socket = sockets.get(name);
      if (!socket) continue;
      const trail = new VortexTrail(
        socket,
        name.includes("left") ? 0 : Math.PI,
      );
      this.trails.push(trail);
      scene.add(trail.mesh);
    }
  }

  update(speed: number, dt: number) {
    this.elapsed += THREE.MathUtils.clamp(dt, 0, 0.05);
    const strength = THREE.MathUtils.clamp((speed - 6) / 19, 0, 1);
    for (const trail of this.trails) trail.update(this.elapsed, strength);
  }

  dispose() {
    for (const trail of this.trails) trail.dispose();
    this.trails.length = 0;
  }
}

export class TrailHistory {
  readonly points: THREE.Vector3[] = [];

  constructor(
    private readonly capacity: number,
    private readonly minDistance = MIN_SAMPLE_DISTANCE,
    private readonly maxLength = MAX_TRAIL_LENGTH,
  ) {}

  push(point: THREE.Vector3) {
    const latest = this.points[this.points.length - 1];
    if (latest && latest.distanceTo(point) > TELEPORT_DISTANCE)
      this.points.length = 0;
    else if (latest && latest.distanceToSquared(point) < this.minDistance ** 2)
      return false;
    this.points.push(point.clone());
    if (this.points.length > this.capacity) this.points.shift();
    while (
      this.points.length > 1 &&
      this.points[0].distanceTo(point) > this.maxLength
    )
      this.points.shift();
    return true;
  }
}

class VortexTrail {
  readonly mesh: THREE.Mesh;
  private readonly history = new TrailHistory(MAX_POINTS);
  private readonly position = new THREE.Vector3();
  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly lifeAttribute: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;

  constructor(
    private readonly socket: THREE.Object3D,
    phase: number,
  ) {
    const geometry = createTrailGeometry();
    this.positionAttribute = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    this.lifeAttribute = geometry.getAttribute(
      "aLife",
    ) as THREE.BufferAttribute;
    this.material = createVortexMaterial(phase);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  update(time: number, strength: number) {
    this.socket.getWorldPosition(this.position);
    this.history.push(this.position);
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uStrength.value = strength;
    this.writeGeometry();
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }

  private writeGeometry() {
    const points = this.history.points;
    const position = this.positionAttribute.array as Float32Array;
    const life = this.lifeAttribute.array as Float32Array;
    const tangent = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const binormal = new THREE.Vector3();
    const reference = new THREE.Vector3();

    for (let index = 0; index < points.length; index++) {
      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      tangent.subVectors(next, previous).normalize();
      reference.set(0, 1, 0);
      if (Math.abs(tangent.dot(reference)) > 0.92) reference.set(1, 0, 0);
      normal.crossVectors(tangent, reference).normalize();
      binormal.crossVectors(tangent, normal).normalize();
      const progress = points.length === 1 ? 1 : index / (points.length - 1);
      const radius = 0.012 + Math.sin(progress * Math.PI) * 0.025;

      for (let side = 0; side < RADIAL_SEGMENTS; side++) {
        const angle = (side / RADIAL_SEGMENTS) * Math.PI * 2;
        const vertex = index * RADIAL_SEGMENTS + side;
        const offset = vertex * 3;
        position[offset] =
          points[index].x +
          (normal.x * Math.cos(angle) + binormal.x * Math.sin(angle)) * radius;
        position[offset + 1] =
          points[index].y +
          (normal.y * Math.cos(angle) + binormal.y * Math.sin(angle)) * radius;
        position[offset + 2] =
          points[index].z +
          (normal.z * Math.cos(angle) + binormal.z * Math.sin(angle)) * radius;
        life[vertex] = progress;
      }
    }
    this.positionAttribute.needsUpdate = true;
    this.lifeAttribute.needsUpdate = true;
    this.mesh.geometry.setDrawRange(
      0,
      Math.max(0, points.length - 1) * RADIAL_SEGMENTS * 6,
    );
    this.mesh.geometry.computeBoundingSphere();
  }
}

function createTrailGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array(MAX_POINTS * RADIAL_SEGMENTS * 3),
      3,
    ),
  );
  geometry.setAttribute(
    "aLife",
    new THREE.BufferAttribute(
      new Float32Array(MAX_POINTS * RADIAL_SEGMENTS),
      1,
    ),
  );
  const indices: number[] = [];
  for (let ring = 0; ring < MAX_POINTS - 1; ring++)
    for (let side = 0; side < RADIAL_SEGMENTS; side++) {
      const nextSide = (side + 1) % RADIAL_SEGMENTS;
      const a = ring * RADIAL_SEGMENTS + side;
      const b = ring * RADIAL_SEGMENTS + nextSide;
      const c = (ring + 1) * RADIAL_SEGMENTS + side;
      const d = (ring + 1) * RADIAL_SEGMENTS + nextSide;
      indices.push(a, c, b, b, c, d);
    }
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  return geometry;
}

function createVortexMaterial(phase: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0.5 },
      uPhase: { value: phase },
    },
    vertexShader: `
      attribute float aLife;
      varying float vLife;
      void main() {
        vLife = aLife;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uStrength;
      uniform float uPhase;
      varying float vLife;
      void main() {
        float tailFade = smoothstep(0.0, .42, vLife);
        float tipFade = smoothstep(1.0, .82, vLife);
        float wisps = .78 + sin(vLife * 48.0 - uTime * 5.0 + uPhase) * .22;
        float alpha = tailFade * tipFade * wisps * (.025 + uStrength * .065);
        vec3 color = mix(vec3(.38, .75, 1.25), vec3(.88, .96, 1.15), vLife);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
