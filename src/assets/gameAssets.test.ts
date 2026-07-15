import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  addMissingPlayerEffectSockets,
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
