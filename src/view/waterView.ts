import * as THREE from 'three';

const WATER_SIZE = 360;
const WATER_SEGMENTS = 192;

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
  varying vec3 vWorldNormal;
  varying float vWaveHeight;
  #include <fog_pars_vertex>

  float wave(vec2 point, vec2 direction, float frequency, float speed, float amplitude) {
    return sin(dot(point, direction) * frequency + uTime * speed) * amplitude;
  }

  vec2 waveGradient(vec2 point, vec2 direction, float frequency, float speed, float amplitude) {
    float phase = dot(point, direction) * frequency + uTime * speed;
    return cos(phase) * amplitude * frequency * direction;
  }

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec2 point = world.xz;
    float height = 0.0;
    vec2 gradient = vec2(0.0);
    vec2 directionA = normalize(vec2(1.0, 0.28));
    vec2 directionB = normalize(vec2(-0.35, 1.0));
    vec2 directionC = normalize(vec2(0.72, 1.0));
    vec2 directionD = normalize(vec2(-1.0, 0.62));
    vec2 directionE = normalize(vec2(0.25, -1.0));
    height += wave(point, directionA, 0.075, 0.72, 0.38);
    height += wave(point, directionB, 0.13, 1.05, 0.22);
    height += wave(point, directionC, 0.23, 1.55, 0.11);
    height += wave(point, directionD, 0.38, 2.10, 0.055);
    height += wave(point, directionE, 0.62, 2.75, 0.028);
    gradient += waveGradient(point, directionA, 0.075, 0.72, 0.38);
    gradient += waveGradient(point, directionB, 0.13, 1.05, 0.22);
    gradient += waveGradient(point, directionC, 0.23, 1.55, 0.11);
    gradient += waveGradient(point, directionD, 0.38, 2.10, 0.055);
    gradient += waveGradient(point, directionE, 0.62, 2.75, 0.028);
    world.y += height;
    vWorldPosition = world.xyz;
    vWorldNormal = normalize(vec3(-gradient.x, 1.0, -gradient.y));
    vWaveHeight = height;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const waterFragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
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
    vec2 ripplePoint = vWorldPosition.xz;
    vec2 ripple = vec2(
      sin(dot(ripplePoint, normalize(vec2(0.82, 0.57))) * 0.92 + uTime * 2.6),
      sin(dot(ripplePoint, normalize(vec2(-0.48, 0.88))) * 1.18 + uTime * 3.1)
    );
    vec2 fineRipple = vec2(
      sin(dot(ripplePoint, normalize(vec2(0.96, -0.28))) * 1.75 - uTime * 3.8),
      sin(dot(ripplePoint, normalize(vec2(0.34, 0.94))) * 2.05 + uTime * 4.2)
    );
    vec3 normal = normalize(vWorldNormal + vec3(
      ripple.x * 0.025 + fineRipple.x * 0.009,
      0.0,
      ripple.y * 0.025 + fineRipple.y * 0.009
    ));
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 sunDirection = normalize(vec3(-0.45, 0.82, -0.25));

    float facing = clamp(normal.y, 0.0, 1.0);
    float slope = 1.0 - facing;
    float diffuse = max(dot(normal, sunDirection), 0.0);
    diffuse = floor(diffuse * 16.0) / 16.0;
    float fresnel = pow(1.0 - max(dot(viewDirection, normal), 0.0), 3.0);

    vec3 deepColor = vec3(0.018, 0.20, 0.40);
    vec3 faceColor = vec3(0.015, 0.46, 0.60);
    vec3 horizonColor = vec3(0.10, 0.62, 0.72);
    vec3 color = mix(deepColor, faceColor, clamp(slope * 3.2 + diffuse * 0.20, 0.0, 1.0));
    color = mix(color, horizonColor, fresnel * 0.42);
    color *= 0.82 + diffuse * 0.24;

    float broadVariation = valueNoise(vWorldPosition.xz * 0.035 + vec2(uTime * 0.012, -uTime * 0.008));
    float trough = 1.0 - smoothstep(-0.42, -0.08, vWaveHeight);
    float darkPatch = trough * 0.22 + smoothstep(0.58, 0.88, broadVariation) * 0.10;
    color = mix(color, vec3(0.012, 0.13, 0.31), darkPatch);

    vec2 foamPoint = vWorldPosition.xz * 0.48 + vec2(uTime * 0.11, -uTime * 0.06);
    float coarseNoise = valueNoise(foamPoint);
    float fineNoise = valueNoise(foamPoint * 3.1 + 8.7);
    float noise = coarseNoise * 0.56 + fineNoise * 0.44;
    color *= 0.95 + noise * 0.09;
    float crest = smoothstep(0.49, 0.61, vWaveHeight + slope * 0.18);
    float brokenCrest = smoothstep(0.67, 0.80, noise) * smoothstep(0.46, 0.64, fineNoise);
    float foam = crest * brokenCrest;
    color = mix(color, vec3(0.72, 0.96, 0.96), foam * 0.42);

    vec3 halfVector = normalize(sunDirection + viewDirection);
    float sparkle = pow(max(dot(normal, halfVector), 0.0), 88.0);
    sparkle *= smoothstep(0.58, 0.82, noise);
    color += vec3(1.0, 0.83, 0.55) * sparkle * 0.85;

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
