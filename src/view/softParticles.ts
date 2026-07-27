import * as THREE from "three";
import {
  FullScreenQuad,
  Pass,
} from "three/examples/jsm/postprocessing/Pass.js";
import { CopyShader } from "three/examples/jsm/shaders/CopyShader.js";

export type SoftParticleUniforms = {
  sceneDepth: THREE.IUniform<THREE.DepthTexture | null>;
  resolution: THREE.IUniform<THREE.Vector2>;
  cameraNear: THREE.IUniform<number>;
  cameraFar: THREE.IUniform<number>;
  softness: THREE.IUniform<number>;
};

export function createSoftParticleUniforms(
  softness = 1.25,
): SoftParticleUniforms {
  return {
    sceneDepth: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 500 },
    softness: { value: softness },
  };
}

export function makeSoftParticleMaterial(
  material: THREE.PointsMaterial,
  uniforms: SoftParticleUniforms,
) {
  material.depthTest = false;
  material.depthWrite = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tSceneDepth = uniforms.sceneDepth;
    shader.uniforms.uSoftParticleResolution = uniforms.resolution;
    shader.uniforms.uSoftParticleCameraNear = uniforms.cameraNear;
    shader.uniforms.uSoftParticleCameraFar = uniforms.cameraFar;
    shader.uniforms.uSoftParticleSoftness = uniforms.softness;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
#include <packing>
uniform sampler2D tSceneDepth;
uniform vec2 uSoftParticleResolution;
uniform float uSoftParticleCameraNear;
uniform float uSoftParticleCameraFar;
uniform float uSoftParticleSoftness;`,
      )
      .replace(
        "#include <map_particle_fragment>",
        `#include <map_particle_fragment>
float softParticleSceneDepth = texture2D(
  tSceneDepth,
  gl_FragCoord.xy / uSoftParticleResolution
).x;
float softParticleSceneViewZ = perspectiveDepthToViewZ(
  softParticleSceneDepth,
  uSoftParticleCameraNear,
  uSoftParticleCameraFar
);
float softParticleViewZ = perspectiveDepthToViewZ(
  gl_FragCoord.z,
  uSoftParticleCameraNear,
  uSoftParticleCameraFar
);
diffuseColor.a *= smoothstep(
  0.0,
  uSoftParticleSoftness,
  softParticleViewZ - softParticleSceneViewZ
);`,
      );
  };
  material.customProgramCacheKey = () => "soft-particle-depth-v1";
  return material;
}

export class SoftParticlePass extends Pass {
  private readonly copyMaterial = new THREE.ShaderMaterial({
    name: "SoftParticlePass.Copy",
    uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
    vertexShader: CopyShader.vertexShader,
    fragmentShader: CopyShader.fragmentShader,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
  });
  private readonly copyQuad = new FullScreenQuad(this.copyMaterial);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly uniforms: SoftParticleUniforms,
  ) {
    super();
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    const depthTexture = readBuffer.depthTexture;
    if (!depthTexture)
      throw new Error("Soft particles require a scene depth texture.");

    this.uniforms.sceneDepth.value = depthTexture;
    this.uniforms.resolution.value.set(readBuffer.width, readBuffer.height);
    this.uniforms.cameraNear.value = this.camera.near;
    this.uniforms.cameraFar.value = this.camera.far;
    this.copyMaterial.uniforms.tDiffuse.value = readBuffer.texture;

    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear)
      renderer.clear(
        renderer.autoClearColor,
        renderer.autoClearDepth,
        renderer.autoClearStencil,
      );
    this.copyQuad.render(renderer);
    renderer.render(this.scene, this.camera);
    renderer.autoClear = previousAutoClear;
  }

  dispose() {
    this.copyMaterial.dispose();
    this.copyQuad.dispose();
  }
}
