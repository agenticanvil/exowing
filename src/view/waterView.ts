import * as THREE from 'three';

const WATER_SIZE = 360;
const WATER_SEGMENTS = 96;

export class WaterView {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor() {
    const geometry = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEGMENTS, WATER_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      fog: true,
      uniforms: {
        ...THREE.UniformsLib.fog,
        uTime: { value: 0 },
      },
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  update(centerX: number, centerZ: number, time: number) {
    this.mesh.position.set(centerX, 0, centerZ);
    this.mesh.material.uniforms.uTime.value = time;
  }
}

const waterVertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPosition;
  varying float vWaveHeight;
  #include <fog_pars_vertex>

  float wave(vec2 point, vec2 direction, float frequency, float speed, float amplitude) {
    return sin(dot(point, direction) * frequency + uTime * speed) * amplitude;
  }

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec2 point = world.xz;
    float height = 0.0;
    height += wave(point, normalize(vec2(1.0, 0.28)), 0.075, 0.72, 0.30);
    height += wave(point, normalize(vec2(-0.35, 1.0)), 0.13, 1.05, 0.17);
    height += wave(point, normalize(vec2(0.72, 1.0)), 0.23, 1.55, 0.09);
    height += wave(point, normalize(vec2(-1.0, 0.62)), 0.38, 2.10, 0.045);
    world.y += height;
    vWorldPosition = world.xyz;
    vWaveHeight = height;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const waterFragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPosition;
  varying float vWaveHeight;
  #include <fog_pars_fragment>

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x),
      mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), local.x),
      local.y
    );
  }

  void main() {
    // Screen derivatives make every displaced grid triangle catch light as a low-poly facet.
    vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    if (normal.y < 0.0) normal = -normal;
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 sunDirection = normalize(vec3(-0.45, 0.82, -0.25));

    float facing = clamp(normal.y, 0.0, 1.0);
    float slope = 1.0 - facing;
    float diffuse = max(dot(normal, sunDirection), 0.0);
    diffuse = floor(diffuse * 5.0) / 5.0;
    float fresnel = pow(1.0 - max(dot(viewDirection, normal), 0.0), 3.0);

    vec3 deepColor = vec3(0.018, 0.20, 0.40);
    vec3 faceColor = vec3(0.015, 0.46, 0.60);
    vec3 horizonColor = vec3(0.10, 0.62, 0.72);
    vec3 color = mix(deepColor, faceColor, clamp(slope * 1.8 + diffuse * 0.18, 0.0, 1.0));
    color = mix(color, horizonColor, fresnel * 0.42);
    color *= 0.82 + diffuse * 0.24;

    vec2 foamPoint = vWorldPosition.xz * 0.18 + vec2(uTime * 0.06, -uTime * 0.035);
    float noise = valueNoise(foamPoint) * 0.65 + valueNoise(foamPoint * 2.1 + 8.7) * 0.35;
    float crest = smoothstep(0.36, 0.58, vWaveHeight + slope * 0.24);
    float foam = crest * smoothstep(0.58, 0.74, noise);
    color = mix(color, vec3(0.72, 0.96, 0.96), foam * 0.55);

    vec3 halfVector = normalize(sunDirection + viewDirection);
    float sparkle = pow(max(dot(normal, halfVector), 0.0), 72.0);
    sparkle *= smoothstep(0.58, 0.82, noise);
    color += vec3(1.0, 0.83, 0.55) * sparkle * 0.85;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
