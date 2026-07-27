import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createSoftParticleUniforms,
  makeSoftParticleMaterial,
} from "./softParticles";

describe("soft particle material", () => {
  it("injects depth-aware intersection fading", () => {
    const uniforms = createSoftParticleUniforms(2);
    const material = makeSoftParticleMaterial(
      new THREE.PointsMaterial(),
      uniforms,
    );
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: "",
      fragmentShader: "#include <common>\n#include <map_particle_fragment>",
    };

    material.onBeforeCompile(shader as never, {} as never);

    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(shader.uniforms.tSceneDepth).toBe(uniforms.sceneDepth);
    expect(shader.uniforms.uSoftParticleSoftness).toBe(uniforms.softness);
    expect(shader.fragmentShader).toContain(
      "softParticleViewZ - softParticleSceneViewZ",
    );
    expect(shader.fragmentShader).toContain(
      "gl_FragCoord.xy / uSoftParticleResolution",
    );
  });

  it("shares mutable render uniforms across smoke materials", () => {
    const uniforms = createSoftParticleUniforms();
    const first = makeSoftParticleMaterial(
      new THREE.PointsMaterial(),
      uniforms,
    );
    const second = makeSoftParticleMaterial(
      new THREE.PointsMaterial(),
      uniforms,
    );
    const firstShader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: "",
      fragmentShader: "#include <common>\n#include <map_particle_fragment>",
    };
    const secondShader = structuredClone(firstShader);

    first.onBeforeCompile(firstShader as never, {} as never);
    second.onBeforeCompile(secondShader as never, {} as never);
    uniforms.resolution.value.set(1920, 1080);

    expect(firstShader.uniforms.uSoftParticleResolution.value).toEqual(
      new THREE.Vector2(1920, 1080),
    );
    expect(secondShader.uniforms.uSoftParticleResolution).toBe(
      firstShader.uniforms.uSoftParticleResolution,
    );
  });
});
