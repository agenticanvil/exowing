import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  addMissingPlayerEffectSockets,
  mergeEnemyMeshes,
  PLAYER_EFFECT_SOCKETS,
} from "./gameAssets";
import { JetExhaustView } from "../view/jetExhaustView";
import { WingtipVortexView } from "../view/wingtipVortexView";

describe("player effect sockets", () => {
  it("adds missing exhaust and wingtip sockets without replacing existing joints", () => {
    const ship = new THREE.Group();
    const existing = new THREE.Object3D();
    existing.name = "socketexhaustleft";
    existing.position.set(9, 8, 7);
    ship.add(existing);

    addMissingPlayerEffectSockets(ship);

    for (const { name } of PLAYER_EFFECT_SOCKETS)
      expect(ship.getObjectByName(name)).toBeDefined();
    expect(ship.getObjectByName(existing.name)).toBe(existing);
    expect(existing.position.toArray()).toEqual([9, 8, 7]);
  });

  it("binds all three exhausts and both wingtip vortices", () => {
    const ship = new THREE.Group();
    const scene = new THREE.Scene();
    addMissingPlayerEffectSockets(ship);

    const exhaust = new JetExhaustView(ship);
    const vortices = new WingtipVortexView(scene, ship);

    for (const name of [
      "socketexhaustleft",
      "socketexhaustcenter",
      "socketexhaustright",
    ])
      expect(ship.getObjectByName(name)?.children).toHaveLength(1);
    expect(scene.children).toHaveLength(2);

    exhaust.dispose();
    vortices.dispose();
  });
});

describe("enemy mesh preparation", () => {
  it("merges transformed submeshes into one vertex-colored instancing source", () => {
    const left = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xff0000 }),
    );
    const rightGeometry = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    rightGeometry.deleteAttribute("uv");
    const right = new THREE.Mesh(
      rightGeometry,
      new THREE.MeshStandardMaterial({ color: 0x0000ff }),
    );
    left.position.x = -1;
    right.position.x = 1;
    left.updateMatrixWorld(true);
    right.updateMatrixWorld(true);

    const merged = mergeEnemyMeshes([left, right], "Test enemy");
    const colors = merged.geometry.getAttribute("color");

    expect(merged.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(merged.geometry.getAttribute("position").count).toBe(
      (left.geometry.index?.count ??
        left.geometry.getAttribute("position").count) +
        (right.geometry.index?.count ??
          right.geometry.getAttribute("position").count),
    );
    expect(colors.count).toBe(merged.geometry.getAttribute("position").count);
    expect(colors.getX(0)).toBeGreaterThan(colors.getZ(0));
    expect(colors.getZ(colors.count - 1)).toBeGreaterThan(
      colors.getX(colors.count - 1),
    );
    expect(merged.geometry.boundingSphere?.radius).toBeGreaterThan(1);

    merged.geometry.dispose();
    merged.material.dispose();
    left.geometry.dispose();
    left.material.dispose();
    right.geometry.dispose();
    right.material.dispose();
  });
});
