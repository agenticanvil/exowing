import * as THREE from 'three';
import type { LevelDefinition } from '../levels';
import type { IslandState } from '../sim/types';

const WATER_SIZE = 360;
const WATER_SEGMENTS = 224;
const MAX_FOAM_ISLANDS = 8;

export class WaterView {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor(level: LevelDefinition) {
    const environment = level.environment;
    const geometry = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEGMENTS, WATER_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      fog: true,
      transparent: true,
      depthWrite: false,
      uniforms: {
        ...THREE.UniformsLib.fog,
        uTime: { value: 0 },
        uSunDirection: { value: new THREE.Vector3(...environment.sunDirection).normalize() },
        uDeepColor: { value: new THREE.Color(environment.waterDeep) },
        uFaceColor: { value: new THREE.Color(environment.waterFace) },
        uHorizonColor: { value: new THREE.Color(environment.waterHorizon) },
        uFoamColor: { value: new THREE.Color(environment.foam) },
        uIslandCount: { value: 0 },
        uIslands: { value: Array.from({ length: MAX_FOAM_ISLANDS }, () => new THREE.Vector4()) },
        uIslandRotations: { value: Array.from({ length: MAX_FOAM_ISLANDS }, () => new THREE.Vector2()) },
      },
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  update(centerX: number, centerZ: number, time: number, islands: IslandState[]) {
    this.mesh.position.set(centerX, 0, centerZ);
    this.mesh.material.uniforms.uTime.value = time;
    const count = Math.min(islands.length, MAX_FOAM_ISLANDS);
    this.mesh.material.uniforms.uIslandCount.value = count;
    const islandUniforms = this.mesh.material.uniforms.uIslands.value as THREE.Vector4[];
    const rotationUniforms = this.mesh.material.uniforms.uIslandRotations.value as THREE.Vector2[];
    for (let index = 0; index < count; index++) {
      const island = islands[index];
      // The generated rock is roughly 1.08 units wide at the waterline.
      islandUniforms[index].set(island.position.x, island.position.z, island.size.x * 1.08, island.size.z * 1.08);
      rotationUniforms[index].set(Math.cos(island.rotation), Math.sin(island.rotation));
    }
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
    vec2 directionF = normalize(vec2(-0.78, -0.63));
    height += wave(point, directionA, 0.075, 0.72, 0.42);
    height += wave(point, directionB, 0.13, 1.05, 0.25);
    height += wave(point, directionC, 0.23, 1.55, 0.13);
    height += wave(point, directionD, 0.38, 2.10, 0.055);
    height += wave(point, directionE, 0.62, 2.75, 0.028);
    height += wave(point, directionF, 0.31, 1.82, 0.065);
    gradient += waveGradient(point, directionA, 0.075, 0.72, 0.42);
    gradient += waveGradient(point, directionB, 0.13, 1.05, 0.25);
    gradient += waveGradient(point, directionC, 0.23, 1.55, 0.13);
    gradient += waveGradient(point, directionD, 0.38, 2.10, 0.055);
    gradient += waveGradient(point, directionE, 0.62, 2.75, 0.028);
    gradient += waveGradient(point, directionF, 0.31, 1.82, 0.065);
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
  uniform vec3 uSunDirection;
  uniform vec3 uDeepColor;
  uniform vec3 uFaceColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uFoamColor;
  uniform int uIslandCount;
  uniform vec4 uIslands[${MAX_FOAM_ISLANDS}];
  uniform vec2 uIslandRotations[${MAX_FOAM_ISLANDS}];
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

  float detailNoise(vec2 point) {
    return valueNoise(point) * 0.52
      + valueNoise(point * 2.07 + 13.4) * 0.30
      + valueNoise(point * 4.19 - 7.1) * 0.18;
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
    vec2 microRipple = vec2(
      sin(dot(ripplePoint, normalize(vec2(-0.91, 0.42))) * 3.35 + uTime * 5.4),
      sin(dot(ripplePoint, normalize(vec2(0.57, 0.82))) * 3.75 - uTime * 5.9)
    );
    vec3 normal = normalize(vWorldNormal + vec3(
      ripple.x * 0.025 + fineRipple.x * 0.009 + microRipple.x * 0.004,
      0.0,
      ripple.y * 0.025 + fineRipple.y * 0.009 + microRipple.y * 0.004
    ));
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 sunDirection = normalize(uSunDirection);

    float facing = clamp(normal.y, 0.0, 1.0);
    float slope = 1.0 - facing;
    float diffuse = max(dot(normal, sunDirection), 0.0);
    diffuse = floor(diffuse * 16.0) / 16.0;
    float fresnel = pow(1.0 - max(dot(viewDirection, normal), 0.0), 3.0);

    // Cool ambient shaping keeps wave faces readable when the sun reflection is
    // outside the camera view. It follows the normals, not a second light source.
    vec2 ambientDirection = normalize(vec2(0.68, -0.73));
    float ambientFace = clamp(0.5 + dot(normal.xz, ambientDirection) * 5.0, 0.0, 1.0);
    ambientFace = floor(ambientFace * 12.0) / 12.0;
    float heightTone = smoothstep(-0.52, 0.52, vWaveHeight);

    vec3 color = mix(uDeepColor, uFaceColor, clamp(slope * 3.2 + diffuse * 0.20 + heightTone * 0.10, 0.0, 1.0));
    color *= mix(0.88, 1.10, ambientFace);
    color = mix(color, uHorizonColor, heightTone * slope * 0.16);
    color = mix(color, uHorizonColor, fresnel * 0.42);
    color *= 0.82 + diffuse * 0.24;

    float broadVariation = valueNoise(vWorldPosition.xz * 0.035 + vec2(uTime * 0.012, -uTime * 0.008));
    float trough = 1.0 - smoothstep(-0.42, -0.08, vWaveHeight);
    float darkPatch = trough * 0.22 + smoothstep(0.58, 0.88, broadVariation) * 0.10;
    color = mix(color, vec3(0.012, 0.13, 0.31), darkPatch);

    vec2 foamPoint = vWorldPosition.xz * 0.48 + vec2(uTime * 0.11, -uTime * 0.06);
    float coarseNoise = detailNoise(foamPoint);
    float fineNoise = detailNoise(foamPoint * 3.35 + 8.7);
    float streakNoise = detailNoise(vec2(foamPoint.x * 0.72, foamPoint.y * 2.35) + 21.3);
    float noise = coarseNoise * 0.46 + fineNoise * 0.36 + streakNoise * 0.18;
    color *= 0.95 + noise * 0.09;
    float crest = smoothstep(0.49, 0.61, vWaveHeight + slope * 0.18);
    float brokenCrest = smoothstep(0.61, 0.72, noise)
      * smoothstep(0.49, 0.64, fineNoise)
      * smoothstep(0.38, 0.62, streakNoise);
    float foam = crest * brokenCrest;
    color = mix(color, vec3(0.72, 0.96, 0.96), foam * 0.42);

    float shorelineFoam = 0.0;
    float shallowWater = 0.0;
    float shallowDepth = 1.0;
    for (int index = 0; index < ${MAX_FOAM_ISLANDS}; index++) {
      if (index >= uIslandCount) break;
      vec4 island = uIslands[index];
      vec2 rotation = uIslandRotations[index];
      vec2 offset = vWorldPosition.xz - island.xy;
      vec2 local = vec2(
        rotation.x * offset.x - rotation.y * offset.y,
        rotation.y * offset.x + rotation.x * offset.y
      );
      vec2 radii = max(island.zw, vec2(0.01));
      float ellipseDistance = (length(local / radii) - 1.0) * min(radii.x, radii.y);
      float shorelineNoise = detailNoise(local * 0.42 + vec2(uTime * 0.16, -uTime * 0.1));
      float edgeDetail = detailNoise(local * 1.35 - vec2(uTime * 0.1, uTime * 0.14));
      float broadNoise = valueNoise(local * 0.16 - vec2(uTime * 0.06, -uTime * 0.04));
      float distortion = (broadNoise - 0.5) * 2.15 + (shorelineNoise - 0.5) * 1.05 + (edgeDetail - 0.5) * 0.32;
      float raggedDistance = ellipseDistance + distortion;
      // Begin well inside the hidden footprint so foam always meets the visible rock edge.
      float solidEdge = 1.0 - smoothstep(0.28, 0.86, raggedDistance);
      float outerWash = smoothstep(2.65, 0.48, raggedDistance) * smoothstep(0.38, 0.94, raggedDistance);
      float breakup = smoothstep(0.42, 0.66, shorelineNoise * 0.58 + edgeDetail * 0.42);
      shorelineFoam = max(shorelineFoam, solidEdge * (0.82 + breakup * 0.18) + outerWash * breakup * 0.38);

      // The wider lower rock rings form a cheap submerged shelf proxy. Water stays
      // clear only over its shallow inner edge, then absorbs rapidly toward blue.
      float normalizedRadius = length(local / radii);
      float shelf = 1.0 - smoothstep(1.0, 1.16, normalizedRadius);
      float estimatedDepth = smoothstep(0.98, 1.16, normalizedRadius);
      if (shelf > shallowWater) {
        shallowWater = shelf;
        shallowDepth = estimatedDepth;
      }
    }
    color = mix(color, uFoamColor, clamp(shorelineFoam, 0.0, 0.94));

    vec3 halfVector = normalize(sunDirection + viewDirection);
    float sparkle = pow(max(dot(normal, halfVector), 0.0), 112.0);
    float fineSparkle = pow(max(dot(normalize(normal + vec3(microRipple.x, 0.0, microRipple.y) * 0.018), halfVector), 0.0), 190.0);
    float sparkleBreakup = smoothstep(0.54, 0.69, detailNoise(ripplePoint * 1.15 + uTime * 0.08));
    sparkle = (sparkle * 0.68 + fineSparkle * 0.52) * sparkleBreakup;
    color += vec3(1.0, 0.83, 0.55) * sparkle * 0.88;

    float shallowClarity = shallowWater * (1.0 - shallowDepth);
    color = mix(color, uFaceColor, shallowWater * shallowDepth * 0.30);
    float alpha = mix(0.965, 0.34, shallowClarity);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
