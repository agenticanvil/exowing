import * as THREE from "three";

const SOCKET_NAMES = [
  "socketexhaustleft",
  "socketexhaustcenter",
  "socketexhaustright",
];
const MIN_SPEED = 6;
const MAX_SPEED = 25;

type ExhaustUniforms = {
  uTime: { value: number };
  uPower: { value: number };
  uTurbulence: { value: number };
};

export class JetExhaustView {
  private readonly plumes: THREE.Group[] = [];
  private readonly uniforms: ExhaustUniforms;
  private elapsed = 0;
  private previousSpeed = 12;

  constructor(ship: THREE.Object3D) {
    this.uniforms = {
      uTime: { value: 0 },
      uPower: { value: 0.45 },
      uTurbulence: { value: 0.2 },
    };

    const sockets = new Map<string, THREE.Object3D>();
    ship.traverse((object) => sockets.set(normalizeName(object.name), object));
    for (const name of SOCKET_NAMES) {
      const socket = sockets.get(name);
      if (!socket) continue;
      const plume = createPlume(
        this.uniforms,
        name.includes("center") ? 1.08 : 0.9,
      );
      socket.add(plume);
      this.plumes.push(plume);
    }
  }

  update(speed: number, dt: number) {
    const safeDt = THREE.MathUtils.clamp(dt, 0, 0.05);
    const acceleration = safeDt > 0 ? (speed - this.previousSpeed) / safeDt : 0;
    const response = exhaustResponse(speed, acceleration);
    this.elapsed += safeDt;
    this.previousSpeed = speed;
    this.uniforms.uTime.value = this.elapsed;
    this.uniforms.uPower.value = response.power;
    this.uniforms.uTurbulence.value = response.turbulence;

    this.plumes.forEach((plume, index) => {
      const flutter =
        Math.sin(this.elapsed * (17 + index * 1.7) + index * 2.1) *
        response.turbulence;
      plume.scale.z = response.length * (1 + flutter * 0.07);
      plume.scale.x = 1 + flutter * 0.035;
      plume.scale.y = 1 - flutter * 0.025;
      plume.rotation.z = flutter * 0.012;
    });
  }

  dispose() {
    for (const plume of this.plumes) {
      plume.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        if (Array.isArray(object.material))
          object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      });
      plume.removeFromParent();
    }
    this.plumes.length = 0;
  }
}

export function exhaustResponse(speed: number, acceleration: number) {
  const pace = THREE.MathUtils.clamp(
    (speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED),
    0,
    1,
  );
  const boost = THREE.MathUtils.clamp(acceleration / 14, 0, 1);
  const braking = THREE.MathUtils.clamp(-acceleration / 14, 0, 1);
  return {
    power: THREE.MathUtils.clamp(0.32 + pace * 0.68 + boost * 0.22, 0, 1.2),
    length: 0.58 + pace * 0.72 + boost * 0.18 - braking * 0.16,
    turbulence: 0.12 + boost * 0.28 + braking * 0.62,
  };
}

function createPlume(uniforms: ExhaustUniforms, radiusScale: number) {
  const group = new THREE.Group();
  const outer = new THREE.Mesh(
    createTaperedTube(0.3 * radiusScale, 0.035, 4.8, 14),
    createExhaustMaterial(uniforms, false),
  );
  const core = new THREE.Mesh(
    createTaperedTube(0.17 * radiusScale, 0.012, 3.25, 12),
    createExhaustMaterial(uniforms, true),
  );
  outer.renderOrder = 2;
  core.renderOrder = 3;
  group.add(outer, core);

  // Nested translucent shock cells read as faceted diamonds through the hot core.
  for (let index = 0; index < 3; index++) {
    const cell = new THREE.Mesh(
      new THREE.OctahedronGeometry((0.115 - index * 0.018) * radiusScale, 0),
      new THREE.MeshBasicMaterial({
        color: index === 0 ? 0xffdfff : 0x77caff,
        transparent: true,
        opacity: 0.52 - index * 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    cell.position.z = 1.05 + index * 0.72;
    cell.scale.z = 2.4;
    cell.rotation.z = Math.PI / 4;
    group.add(cell);
  }
  return group;
}

function createTaperedTube(
  startRadius: number,
  endRadius: number,
  length: number,
  segments: number,
) {
  const geometry = new THREE.CylinderGeometry(
    endRadius,
    startRadius,
    length,
    segments,
    12,
    true,
  );
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, length / 2);
  return geometry;
}

function createExhaustMaterial(uniforms: ExhaustUniforms, core: boolean) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      varying float vFacet;
      void main() {
        vUv = uv;
        vFacet = abs(normal.x) * .45 + abs(normal.y) * .55;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uPower;
      uniform float uTurbulence;
      varying vec2 vUv;
      varying float vFacet;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        float along = vUv.y;
        float edge = sin(vUv.x * 3.14159265);
        float bands = sin(along * 38.0 - uTime * (18.0 + uPower * 12.0));
        float noise = hash(floor(vec2(vUv.x * 18.0, along * 34.0 - uTime * 13.0)));
        float breakup = smoothstep(.05, .8, 1.0 - along + (bands * .07 + noise * .1) * uTurbulence);
        float alpha = edge * breakup * ${core ? "0.88" : "0.42"} * smoothstep(1.0, .72, along);
        vec3 hot = vec3(1.45, .78, 1.8);
        vec3 blue = vec3(.14, .72, 2.15);
        vec3 color = mix(hot, blue, smoothstep(.04, .72, along));
        color *= (${core ? "1.7" : "1.05"} + vFacet * .22) * (.68 + uPower * .55);
        gl_FragColor = vec4(color, alpha * (.72 + uPower * .28));
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
