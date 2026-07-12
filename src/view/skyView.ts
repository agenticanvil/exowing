import * as THREE from "three";
import type { LevelDefinition } from "../levels";

export class SkyView {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

  constructor(level: LevelDefinition) {
    const environment = level.environment;
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDirection: {
          value: new THREE.Vector3(...environment.sunDirection).normalize(),
        },
        uHorizonColor: { value: new THREE.Color(environment.horizon) },
        uZenithColor: { value: new THREE.Color(environment.zenith) },
        uUpperSkyColor: { value: new THREE.Color(environment.upperSky) },
        uSunsetColor: { value: new THREE.Color(environment.sunset) },
        uSunIntensity: { value: environment.skySunIntensity },
      },
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 20), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
  }

  update(cameraPosition: THREE.Vector3) {
    this.mesh.position.copy(cameraPosition);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

const skyVertexShader = /* glsl */ `
  varying vec3 vSkyDirection;

  void main() {
    vSkyDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragmentShader = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform vec3 uHorizonColor;
  uniform vec3 uZenithColor;
  uniform vec3 uUpperSkyColor;
  uniform vec3 uSunsetColor;
  uniform float uSunIntensity;
  varying vec3 vSkyDirection;

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

  float cloudNoise(vec2 point) {
    return valueNoise(point) * 0.58
      + valueNoise(point * 2.07 + 13.4) * 0.28
      + valueNoise(point * 4.19 - 7.1) * 0.14;
  }

  void main() {
    vec3 direction = normalize(vSkyDirection);
    float elevation = clamp(direction.y, 0.0, 1.0);
    float upperBlend = smoothstep(0.02, 0.55, elevation);
    float zenithBlend = smoothstep(0.45, 1.0, elevation);
    vec3 sky = mix(uHorizonColor, uUpperSkyColor, upperBlend);
    sky = mix(sky, uZenithColor, zenithBlend * 0.88);

    float sunAlignment = max(dot(direction, normalize(uSunDirection)), 0.0);
    float warmSide = pow(sunAlignment, 5.0) * (1.0 - elevation * 0.32);
    sky = mix(sky, uSunsetColor, warmSide * 0.54);

    float horizonHaze = pow(1.0 - elevation, 9.0);
    sky = mix(sky, uHorizonColor * 1.08, horizonHaze * 0.72);

    vec2 cloudPoint = direction.xz / max(direction.y + 0.22, 0.25) * 0.72;
    float clouds = cloudNoise(cloudPoint) * 0.66 + cloudNoise(cloudPoint * 2.4 + 11.7) * 0.34;
    clouds = smoothstep(0.53, 0.72, clouds) * smoothstep(0.03, 0.38, elevation);
    vec3 cloudColor = mix(uHorizonColor * 1.16, vec3(0.94, 0.96, 0.98), elevation);
    sky = mix(sky, cloudColor, clouds * 0.68);

    float sunHalo = pow(sunAlignment, 72.0);
    float sunAura = pow(sunAlignment, 320.0);
    float sunDisc = smoothstep(0.99915, 0.99962, sunAlignment);
    sky += vec3(1.0, 0.58, 0.24) * sunHalo * 0.32 * uSunIntensity;
    sky += vec3(1.0, 0.82, 0.52) * sunAura * 1.1 * uSunIntensity;
    sky = mix(sky, vec3(4.2, 3.7, 2.65), sunDisc * uSunIntensity);

    gl_FragColor = vec4(sky, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
