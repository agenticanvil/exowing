import { describe, expect, it, vi } from "vitest";
import { FlightSimulation } from "./flightSimulation";
import { railOffsetPosition, SECTION_LENGTH, SECTION_SPAN } from "./railSystem";
import type { EnemyState } from "./types";
import { islandField, IslandSystem } from "../world/islandSystem";
import { createWorld } from "../world/worldSystem";
import type { LevelEnemyPlan } from "../enemies";

const islandWorld = () =>
  createWorld([islandField({ style: "weathered", color: 0x8b714d })]);

describe("FlightSimulation", () => {
  it("spawns mixed enemy groups and completes a boss-free encounter plan", () => {
    const enemyPlan = {
      waves: [
        {
          spawnAtRailDistance: 0,
          enemyRailDistance: 80,
          exitAtRailDistance: 0,
          groups: [
            {
              enemy: "riftspike",
              formation: [
                [-3, 4],
                [3, 4],
              ],
            },
            { enemy: "thornwing", formation: [[0, 7]] },
          ],
        },
      ],
    } satisfies LevelEnemyPlan;
    const sim = new FlightSimulation({ enemyPlan });

    expect(sim.enemies.map((enemy) => enemy.enemyId)).toEqual([
      "riftspike",
      "riftspike",
      "thornwing",
    ]);
    expect(sim.enemies.map((enemy) => [enemy.offsetX, enemy.offsetY])).toEqual([
      [-3, 4],
      [3, 4],
      [0, 7],
    ]);

    const result = sim.step(
      { steerX: 0, steerY: 0, fire: false, pace: 0 },
      1 / 60,
    );
    expect(result.levelComplete).toBe(true);
    expect(result.bossDefeated).toBe(false);
  });

  it("can gate a later wave until the previous wave resolves", () => {
    const enemyPlan = {
      waves: [
        {
          spawnAtRailDistance: 0,
          enemyRailDistance: 80,
          exitAtRailDistance: 0,
          groups: [{ enemy: "riftspike", formation: [[0, 4]] }],
        },
        {
          spawnAtRailDistance: 0,
          enemyRailDistance: 120,
          requiresPreviousWaveResolved: true,
          groups: [{ enemy: "riftmaw", formation: [[0, 7]] }],
        },
      ],
    } satisfies LevelEnemyPlan;
    const sim = new FlightSimulation({ enemyPlan });

    expect(sim.enemies.map((enemy) => enemy.enemyId)).toEqual(["riftspike"]);
    sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);
    expect(sim.enemies.map((enemy) => enemy.enemyId)).toEqual(["riftspike"]);
    sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);
    expect(sim.enemies.map((enemy) => enemy.enemyId)).toEqual([
      "riftspike",
      "riftmaw",
    ]);
  });

  it("fires player projectiles at the configured speed", () => {
    const sim = new FlightSimulation();
    sim.projectiles.length = 0;

    sim.step({ steerX: 0, steerY: 0, fire: true, pace: 0 }, 1 / 60);

    const shot = sim.projectiles.find(
      (projectile) => projectile.owner === "player",
    );
    expect(shot).toBeDefined();
    expect(Math.hypot(shot!.velocity.x, shot!.velocity.z)).toBeCloseTo(102);
  });

  it("assists only a narrow forward target and rewards exact alignment", () => {
    const sim = new FlightSimulation();
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    sim.enemies.push({
      id: 9_500,
      enemyId: "riftspike",
      position: railOffsetPosition(50, 0, 4),
      radius: 1.25,
      railDistance: 50,
      offsetX: 0,
      offsetY: 4,
      phase: 0,
      waveIndex: 0,
      controller: "formation",
      health: 5,
      maxHealth: 5,
    });

    expect(sim.aimSolution).toMatchObject({
      enemyId: 9_500,
      precision: true,
    });
    sim.step({ steerX: 0, steerY: 0, fire: true, pace: 0 }, 0);
    expect(
      sim.projectiles.find((shot) => shot.owner === "player"),
    ).toMatchObject({ damage: 1.5, precision: true });

    sim.player.offsetX = -12;
    expect(sim.aimSolution).toBeUndefined();
  });

  it("widens and strengthens aim assistance with magnetic bolts", () => {
    const standard = new FlightSimulation();
    const magnetic = new FlightSimulation({ upgrades: ["magnetic-bolts"] });
    for (const sim of [standard, magnetic]) {
      sim.enemies.length = 0;
      sim.player.offsetX = -6;
      sim.enemies.push({
        id: 9_505,
        enemyId: "riftspike",
        position: railOffsetPosition(50, 0, 4),
        radius: 1.25,
        railDistance: 50,
        offsetX: 0,
        offsetY: 4,
        phase: 0,
        waveIndex: 0,
        controller: "formation",
        health: 5,
        maxHealth: 5,
      });
    }

    expect(standard.aimSolution).toBeUndefined();
    expect(magnetic.aimSolution).toMatchObject({ enemyId: 9_505 });
    expect(Math.abs(magnetic.aimSolution!.assistedDirection.x)).toBeGreaterThan(
      0.04,
    );
  });

  it("locks missiles while held and fires the salvo on release", () => {
    const sim = new FlightSimulation();
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    sim.enemies.push({
      id: 9_510,
      enemyId: "riftspike",
      position: railOffsetPosition(50, 0, 4),
      radius: 1.25,
      railDistance: 50,
      offsetX: 0,
      offsetY: 4,
      phase: 0,
      waveIndex: 0,
      controller: "formation",
      health: 5,
      maxHealth: 5,
    });

    for (let frame = 0; frame < 24; frame++)
      sim.step(
        { steerX: 0, steerY: 0, fire: false, secondary: true, pace: 0 },
        1 / 60,
      );
    expect(sim.player.missileLockTargetIds).toEqual([9_510]);
    expect(sim.projectiles.some((shot) => shot.kind === "homing-missile")).toBe(
      false,
    );

    sim.step(
      { steerX: 0, steerY: 0, fire: false, secondary: false, pace: 0 },
      0,
    );
    expect(
      sim.projectiles.find((shot) => shot.kind === "homing-missile"),
    ).toMatchObject({ targetEnemyId: 9_510 });
    expect(sim.player.homingMissiles).toBe(2);
  });

  it("can stack a full missile salvo onto a boss", () => {
    const sim = new FlightSimulation();
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    sim.enemies.push({
      id: 9_520,
      enemyId: "riftmaw",
      position: railOffsetPosition(60, 0, 4),
      radius: 3.5,
      railDistance: 60,
      offsetX: 0,
      offsetY: 4,
      phase: 0,
      waveIndex: 0,
      controller: "formation",
      kind: "boss",
      health: 24,
      maxHealth: 24,
    });

    for (let frame = 0; frame < 66; frame++)
      sim.step(
        { steerX: 0, steerY: 0, fire: false, secondary: true, pace: 0 },
        1 / 60,
      );
    expect(sim.player.missileLockTargetIds).toEqual([9_520, 9_520, 9_520]);
    sim.step(
      { steerX: 0, steerY: 0, fire: false, secondary: false, pace: 0 },
      0,
    );
    expect(
      sim.projectiles.filter((shot) => shot.kind === "homing-missile"),
    ).toHaveLength(3);
  });

  it("keeps late-level hostile projectile pressure inside its budget", () => {
    const sim = new FlightSimulation({ level: 6 });
    sim.invulnerable = true;
    let peakHostileProjectiles = 0;
    for (let frame = 0; frame < 60 * 12; frame++) {
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);
      peakHostileProjectiles = Math.max(
        peakHostileProjectiles,
        sim.projectiles.filter((shot) => shot.owner === "enemy").length,
      );
    }
    expect(peakHostileProjectiles).toBeGreaterThan(0);
    expect(peakHostileProjectiles).toBeLessThanOrEqual(18);
  });

  it("applies persistent campaign upgrades to primary, locks, and shields", () => {
    const sim = new FlightSimulation({
      upgrades: ["twin-bolts", "extra-lock", "reinforced-shield"],
    });
    sim.projectiles.length = 0;
    expect(sim.player.maxShield).toBe(6);
    expect(sim.player.shield).toBe(6);
    expect(sim.missileLockLimit).toBe(4);

    const result = sim.step({ steerX: 0, steerY: 0, fire: true, pace: 0 }, 0);
    expect(result.shotsFired).toBe(2);
    expect(
      sim.projectiles.filter((shot) => shot.owner === "player"),
    ).toHaveLength(2);
  });

  it("applies calibrated emitters and heavy warheads", () => {
    const standard = new FlightSimulation();
    const calibrated = new FlightSimulation({
      upgrades: ["calibrated-emitters"],
    });
    standard.projectiles.length = 0;
    calibrated.projectiles.length = 0;
    standard.step({ steerX: 0, steerY: 0, fire: true, pace: 0 }, 0);
    calibrated.step({ steerX: 0, steerY: 0, fire: true, pace: 0 }, 0);

    expect(
      standard.step({ steerX: 0, steerY: 0, fire: true, pace: 0 }, 0.16)
        .shotsFired,
    ).toBe(0);
    expect(
      calibrated.step({ steerX: 0, steerY: 0, fire: true, pace: 0 }, 0.16)
        .shotsFired,
    ).toBe(1);

    const heavy = new FlightSimulation({
      upgrades: ["faster-lock", "heavy-warheads"],
    });
    heavy.enemies.length = 0;
    heavy.projectiles.length = 0;
    heavy.enemies.push({
      id: 9_530,
      enemyId: "riftmaw",
      position: railOffsetPosition(60, 0, 4),
      radius: 3.5,
      railDistance: 60,
      offsetX: 0,
      offsetY: 4,
      phase: 0,
      waveIndex: 0,
      controller: "formation",
      kind: "boss",
      health: 24,
      maxHealth: 24,
    });
    for (let frame = 0; frame < 30; frame++)
      heavy.step(
        { steerX: 0, steerY: 0, fire: false, secondary: true, pace: 0 },
        1 / 60,
      );
    heavy.step(
      { steerX: 0, steerY: 0, fire: false, secondary: false, pace: 0 },
      0,
    );

    expect(heavy.missileLockLimit).toBe(2);
    expect(
      heavy.projectiles.find((shot) => shot.kind === "homing-missile"),
    ).toMatchObject({ damage: 6 });
  });

  it("retargets a destroyed missile target with salvo protocol", () => {
    const sim = new FlightSimulation({ upgrades: ["salvo-protocol"] });
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    sim.enemies.push({
      id: 9_540,
      enemyId: "riftspike",
      position: railOffsetPosition(12, 0, 4),
      radius: 1.25,
      railDistance: 12,
      offsetX: 0,
      offsetY: 4,
      phase: 0,
      waveIndex: 0,
      controller: "formation",
      health: 5,
      maxHealth: 5,
    });
    sim.projectiles.push({
      id: 9_541,
      position: railOffsetPosition(0, 0, 4),
      velocity: { x: 0, y: 0, z: 70 },
      radius: 0.55,
      owner: "player",
      damage: 4,
      kind: "homing-missile",
      targetEnemyId: 404,
      retargetsRemaining: 1,
    });

    sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 0);

    expect(sim.projectiles[0]).toMatchObject({
      targetEnemyId: 9_540,
      retargetsRemaining: 0,
    });
  });

  it("triggers overdrive after ten primary hits", () => {
    const sim = new FlightSimulation({ upgrades: ["overdrive-core"] });
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    const enemy: EnemyState = {
      id: 9_550,
      enemyId: "riftspike",
      position: railOffsetPosition(20, 0, 4),
      radius: 1.25,
      railDistance: 20,
      offsetX: 0,
      offsetY: 4,
      phase: 0,
      waveIndex: 0,
      controller: "formation",
      health: 100,
      maxHealth: 100,
    };
    sim.enemies.push(enemy);
    for (let hit = 0; hit < 10; hit++) {
      sim.projectiles.push({
        id: 10_000 + hit,
        position: { ...enemy.position },
        velocity: { x: 0, y: 0, z: 0 },
        radius: 0.3,
        owner: "player",
        damage: 1,
        kind: "bolt",
      });
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 0);
    }

    sim.step({ steerX: 0, steerY: 0, fire: true, pace: 0 }, 0);
    expect(
      sim.step({ steerX: 0, steerY: 0, fire: true, pace: 0 }, 0.13).shotsFired,
    ).toBe(1);
  });

  it("delays a resolved encounter before spawning the next beat", () => {
    const enemyPlan = {
      waves: [
        {
          spawnAtRailDistance: 0,
          enemyRailDistance: 50,
          exitAtRailDistance: 0,
          groups: [{ enemy: "riftspike", formation: [[0, 4]] }],
        },
        {
          spawnAtRailDistance: 0,
          enemyRailDistance: 70,
          requiresPreviousWaveResolved: true,
          spawnDelaySeconds: 5,
          groups: [{ enemy: "thornwing", formation: [[0, 5]] }],
        },
      ],
    } satisfies LevelEnemyPlan;
    const sim = new FlightSimulation({ enemyPlan });

    sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 0);
    sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 4.9);
    expect(sim.enemies.some((enemy) => enemy.enemyId === "thornwing")).toBe(
      false,
    );
    sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 0.2);
    expect(sim.enemies.some((enemy) => enemy.enemyId === "thornwing")).toBe(
      true,
    );
  });

  it("ignores enemy shots when the final enemy dies in the same step", () => {
    const enemyPlan = {
      waves: [
        {
          spawnAtRailDistance: 0,
          enemyRailDistance: 0,
          groups: [{ enemy: "riftspike", formation: [[0, 4]] }],
        },
      ],
    } satisfies LevelEnemyPlan;
    const sim = new FlightSimulation({ enemyPlan });
    const enemy = sim.enemies[0]!;
    sim.projectiles.length = 0;
    sim.projectiles.push(
      {
        id: 10_001,
        position: { ...enemy.position },
        velocity: { x: 0, y: 0, z: 0 },
        radius: 0.3,
        owner: "player",
      },
      {
        id: 10_002,
        position: railOffsetPosition(0, 0, 4),
        velocity: { x: 0, y: 0, z: 0 },
        radius: 2,
        owner: "enemy",
        damage: 5,
      },
    );

    const result = sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 0);

    expect(result.levelComplete).toBe(true);
    expect(result.playerHits).toBe(0);
    expect(sim.player.shield).toBe(5);
    expect(sim.projectiles.some((shot) => shot.owner === "enemy")).toBe(false);
  });

  it("moves deterministically and keeps the player inside the flight window", () => {
    const first = new FlightSimulation();
    const second = new FlightSimulation();
    for (let i = 0; i < 120; i++) {
      const command = { steerX: 1, steerY: 1, fire: false, pace: 0, roll: 0 };
      first.step(command, 1 / 60);
      second.step(command, 1 / 60);
    }
    expect(first.player).toEqual(second.player);
    expect(first.player.offsetX).toBe(14);
    expect(first.player.offsetY).toBe(13);
    expect(first.railDistance).toBeCloseTo(30);
  });

  it("barrel rolls laterally, stays in bounds, and dodges hostile shots", () => {
    const sim = new FlightSimulation();
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    sim.projectiles.push({
      id: 9999,
      position: railOffsetPosition(0, 0, 4),
      velocity: { x: 0, y: 0, z: 0 },
      radius: 2,
      owner: "enemy",
    });

    const result = sim.step(
      { steerX: 0, steerY: 0, fire: false, pace: 0, roll: 1 },
      1 / 60,
    );
    expect(result.playerHits).toBe(0);
    expect(sim.player.shield).toBe(5);
    expect(sim.player.offsetX).toBeGreaterThan(0);
    expect(sim.player.rollDirection).toBe(1);

    for (let i = 0; i < 60; i++)
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0, roll: 0 }, 1 / 60);
    expect(sim.player.offsetX).toBeCloseTo(9.25);
    expect(sim.player.offsetX).toBeLessThanOrEqual(14);
    expect(sim.player.rollDirection).toBe(1);
    expect(sim.player.rollProgress).toBe(1);
  });

  it("enforces roll recovery and applies the mutually exclusive roll upgrades", () => {
    const standard = new FlightSimulation();
    standard.step({ steerX: 0, steerY: 0, fire: false, pace: 0, roll: 1 }, 0);
    standard.step({ steerX: 0, steerY: 0, fire: false, pace: 0, roll: 0 }, 0.5);
    expect(standard.player.rollCooldownRemaining).toBe(1);
    standard.step({ steerX: 0, steerY: 0, fire: false, pace: 0, roll: -1 }, 0);
    expect(standard.player.rollDirection).toBe(1);

    const phase = new FlightSimulation({ upgrades: ["phase-roll"] });
    phase.step({ steerX: 0, steerY: 0, fire: false, pace: 0, roll: 1 }, 0);
    phase.step({ steerX: 0, steerY: 0, fire: false, pace: 0, roll: 0 }, 0.5);
    expect(phase.player.rollProgress).toBeCloseTo(5 / 6);
    expect(phase.player.rollCooldownRemaining).toBe(0);
    phase.step({ steerX: 0, steerY: 0, fire: false, pace: 0, roll: 0 }, 0.1);
    expect(phase.player.rollProgress).toBe(1);
    expect(phase.player.rollCooldownRemaining).toBe(1);

    const reflex = new FlightSimulation({ upgrades: ["reflex-actuators"] });
    reflex.step({ steerX: 0, steerY: 0, fire: false, pace: 0, roll: 1 }, 0);
    reflex.step({ steerX: 0, steerY: 0, fire: false, pace: 0, roll: 0 }, 0.5);
    expect(reflex.player.rollCooldownRemaining).toBe(0.8);
  });

  it("turns a close roll into faster fire with reflex core", () => {
    const sim = new FlightSimulation({ upgrades: ["reflex-core"] });
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    sim.projectiles.push({
      id: 9_560,
      position: railOffsetPosition(0, 0, 4),
      velocity: { x: 0, y: 0, z: 0 },
      radius: 0.3,
      owner: "enemy",
    });

    sim.step({ steerX: 0, steerY: 0, fire: true, pace: 0, roll: 1 }, 0);
    expect(
      sim.step({ steerX: 0, steerY: 0, fire: true, pace: 0 }, 0.13).shotsFired,
    ).toBe(1);
  });

  it("checks level geometry for player shots, not active enemy shots", () => {
    const world = createWorld([]);
    const collisionCheck = vi
      .spyOn(world, "projectileCollides")
      .mockReturnValue(true);
    const sim = new FlightSimulation({ world });
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    sim.projectiles.push({
      id: 9999,
      position: railOffsetPosition(0, 0, 4),
      velocity: { x: 0, y: 0, z: 0 },
      radius: 0.3,
      owner: "player",
    });

    sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);

    expect(collisionCheck).toHaveBeenCalledOnce();
    expect(sim.projectiles).toHaveLength(0);

    collisionCheck.mockClear();
    sim.projectiles.push({
      id: 9998,
      position: railOffsetPosition(sim.railDistance, 0, 4),
      velocity: { x: 0, y: 0, z: 0 },
      radius: 0.3,
      owner: "enemy",
    });
    const enemyResult = sim.step(
      { steerX: 0, steerY: 0, fire: false, pace: 0 },
      1 / 60,
    );
    expect(collisionCheck).not.toHaveBeenCalled();
    expect(enemyResult.playerHits).toBe(1);
  });

  it("cancels enemy fire when a collidable AABB blocks the firing line", () => {
    const world = createWorld([]);
    const lineCheck = vi
      .spyOn(world, "lineOfFireBlocked")
      .mockReturnValue(true);
    const sim = new FlightSimulation({ world });
    sim.projectiles.length = 0;

    for (let frame = 0; frame < 180; frame++)
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);

    expect(lineCheck).toHaveBeenCalled();
    expect(sim.projectiles.some((shot) => shot.owner === "enemy")).toBe(false);
  });

  it("removes a sphere enemy hit by a straight projectile", () => {
    const sim = new FlightSimulation({ world: islandWorld() });
    sim.enemies.length = 0;
    sim.enemies.push({
      id: 999,
      enemyId: "riftspike",
      position: railOffsetPosition(40, 0, 4),
      radius: 1.25,
      railDistance: 40,
      offsetX: 0,
      offsetY: 4,
      phase: 0,
      waveIndex: 0,
      controller: "formation",
    });
    for (let i = 0; i < 90; i++)
      sim.step({ steerX: 0, steerY: 0, fire: i === 0, pace: 0 }, 1 / 60);
    expect(sim.enemies.some((enemy) => enemy.id === 999)).toBe(false);
    expect(sim.score).toBeGreaterThan(0);
  });

  it("keeps a bounded destruction record briefly after a kill", () => {
    const emit = vi.fn();
    const sim = new FlightSimulation({ events: { emit } });
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    sim.enemies.push({
      id: 999,
      enemyId: "riftspike",
      position: { x: 0, y: 4, z: 0 },
      radius: 1.25,
      railDistance: 0,
      offsetX: 0,
      offsetY: 4,
      phase: 0,
      waveIndex: 0,
      controller: "formation",
      scatterVelocity: { x: 0, y: 0, z: 0 },
    });
    sim.projectiles.push({
      id: 1000,
      position: { x: 0, y: 4, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      radius: 0.3,
      owner: "player",
    });

    sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);

    expect(sim.enemies).toHaveLength(0);
    expect(sim.enemyDestructions).toEqual([
      expect.objectContaining({ id: 999, kind: "standard", age: 0 }),
    ]);
    expect(emit).toHaveBeenCalledWith({
      type: "enemy-exploded",
      position: { x: 0, y: 4, z: 0 },
      listenerPosition: expect.any(Object),
    });

    for (let frame = 0; frame < 90; frame++)
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);
    expect(sim.enemyDestructions).toHaveLength(0);
  });

  it("detects swept projectile hits between frames without accepting a near miss", () => {
    const createSim = (shotY: number) => {
      const sim = new FlightSimulation();
      sim.enemies.length = 0;
      sim.projectiles.length = 0;
      sim.enemies.push({
        id: 999,
        enemyId: "riftspike",
        position: { x: 0, y: 4, z: 0 },
        radius: 1.25,
        railDistance: 0,
        offsetX: 0,
        offsetY: 4,
        phase: 0,
        waveIndex: 0,
        controller: "formation",
        scatterVelocity: { x: 0, y: 0, z: 0 },
      });
      sim.projectiles.push({
        id: 1000,
        position: { x: -5, y: shotY, z: 0 },
        velocity: { x: 100, y: 0, z: 0 },
        radius: 0.3,
        owner: "player",
      });
      return sim;
    };

    const hit = createSim(4);
    expect(
      hit.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 0.1).enemyHits,
    ).toBe(1);

    const nearMiss = createSim(5.56);
    expect(
      nearMiss.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 0.1)
        .enemyHits,
    ).toBe(0);
    expect(nearMiss.enemies.some((enemy) => enemy.id === 999)).toBe(true);
  });

  it("smoothly accelerates and brakes without jumping to the target pace", () => {
    const sim = new FlightSimulation();
    sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 60);
    expect(sim.railSpeed).toBeGreaterThan(15);
    expect(sim.railSpeed).toBeLessThan(25);

    for (let i = 0; i < 60; i++)
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 60);
    expect(sim.railSpeed).toBe(25);

    sim.step({ steerX: 0, steerY: 0, fire: false, pace: -1 }, 1 / 60);
    expect(sim.railSpeed).toBeLessThan(25);
    expect(sim.railSpeed).toBeGreaterThan(6);

    for (let i = 0; i < 90; i++)
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: -1 }, 1 / 60);
    expect(sim.railSpeed).toBe(6);
  });

  it("streams scenery with a bounded live set during long flights", () => {
    const sim = new FlightSimulation({ world: islandWorld() });
    for (let i = 0; i < 60 * 100; i++)
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 60);
    expect(sim.railDistance).toBeGreaterThan(SECTION_LENGTH * 3);
    const islands = sim.world.get<IslandSystem>("islands")!.islands;
    expect(islands.length).toBeGreaterThan(3);
    expect(islands.length).toBeLessThan(10);
  });

  it("does not stream islands when the level has no island scenery system", () => {
    const sim = new FlightSimulation({ world: createWorld([]) });
    for (let i = 0; i < 60 * 20; i++)
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 60);
    expect(sim.world.get("islands")).toBeUndefined();
  });

  it("moves formations along the rail and scatters survivors near the section end", () => {
    const sim = new FlightSimulation();
    const enemy = sim.enemies[0];
    const startDistance = enemy.railDistance;
    for (let i = 0; i < 60; i++)
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);
    expect(enemy.railDistance).toBeGreaterThan(startDistance);
    while (sim.railDistance < SECTION_LENGTH - 40)
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 60);
    expect(enemy.scatterVelocity).toBeDefined();
  });

  it("lets standard enemies vary depth, dodge imperfectly, and return fire", () => {
    const sim = new FlightSimulation();
    const enemy = sim.enemies[0];
    const initialOffsetX = enemy.offsetX;
    const initialSpacing = enemy.railDistance - sim.railDistance;
    for (let i = 0; i < 240; i++)
      sim.step({ steerX: 0, steerY: 0, fire: i < 20, pace: 0 }, 1 / 60);
    expect(enemy.offsetX).not.toBe(initialOffsetX);
    expect(enemy.railDistance - sim.railDistance).not.toBeCloseTo(
      initialSpacing - (15 - 7) * 4,
    );
    expect(sim.projectiles.some((shot) => shot.owner === "enemy")).toBe(true);
  });

  it("keeps attacking while retreating before a standard enemy gets too close", () => {
    const sim = new FlightSimulation();
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    const enemy: EnemyState = {
      id: 997,
      enemyId: "riftspike",
      position: railOffsetPosition(13, 0, 4),
      radius: 1.25,
      railDistance: 13,
      offsetX: 0,
      offsetY: 4,
      phase: 0,
      waveIndex: 0,
      controller: "standard",
      controllerState: {
        decisionCooldown: 1,
        fireCooldown: 0,
        desiredX: 0,
        desiredY: 0,
        desiredDepthSpeed: 0,
      },
    };
    sim.enemies.push(enemy);
    for (let frame = 0; frame < 60; frame++)
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);
    expect(enemy.scatterVelocity).toBeUndefined();
    expect(enemy.railDistance - sim.railDistance).toBeGreaterThan(13);
    expect(sim.projectiles.some((shot) => shot.owner === "enemy")).toBe(true);
    for (let i = 0; i < 30; i++)
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);
    expect(sim.enemies).toContain(enemy);
  });

  it("makes close bosses retreat in quick, varying bursts while firing", () => {
    const sim = new FlightSimulation();
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    const boss: EnemyState = {
      id: 998,
      enemyId: "riftmaw",
      position: railOffsetPosition(28, 0, 4),
      radius: 3.5,
      railDistance: 28,
      offsetX: 0,
      offsetY: 4,
      phase: 0,
      waveIndex: 0,
      controller: "boss",
      kind: "boss",
      controllerState: {
        decisionCooldown: 0,
        fireCooldown: 0,
        desiredX: 0,
        desiredY: 0,
        desiredDepthSpeed: 0,
      },
    };
    sim.enemies.push(boss);
    const startDistance = boss.railDistance - sim.railDistance;
    const lateralSpeeds = new Set<number>();
    for (let i = 0; i < 45; i++) {
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);
      lateralSpeeds.add(Math.round((boss.controllerState?.desiredX ?? 0) * 10));
    }
    expect(boss.railDistance - sim.railDistance).toBeGreaterThan(startDistance);
    expect(lateralSpeeds.size).toBeGreaterThan(2);
    expect(sim.projectiles.some((shot) => shot.owner === "enemy")).toBe(true);
  });

  it("requires repeated hits to defeat a boss and reports level completion", () => {
    const sim = new FlightSimulation();
    sim.enemies.length = 0;
    const boss: EnemyState = {
      id: 998,
      enemyId: "riftmaw",
      position: railOffsetPosition(40, 0, 4),
      radius: 3.5,
      railDistance: 40,
      offsetX: 0,
      offsetY: 4,
      phase: 0,
      waveIndex: 2,
      controller: "formation",
      kind: "boss",
      health: 2,
      maxHealth: 2,
    };
    sim.enemies.push(boss);

    let completed = false;
    for (let frame = 0; frame < 180 && !completed; frame++) {
      const result = sim.step(
        { steerX: 0, steerY: 0, fire: frame % 20 === 0, pace: 0 },
        1 / 60,
      );
      completed = result.bossDefeated;
    }
    expect(completed).toBe(true);
    expect(sim.enemies).not.toContain(boss);
    expect(sim.score).toBeGreaterThanOrEqual(2500);
  });

  it("waits until the second wave resolves and the second turn ends before spawning the boss", () => {
    const sim = new FlightSimulation();
    sim.invulnerable = true;
    while (sim.railDistance < SECTION_SPAN * 2 - 1) {
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 30);
    }
    expect(sim.boss).toBeUndefined();
    expect(
      new Set(
        sim.enemies
          .filter((enemy) => enemy.kind !== "boss")
          .map((enemy) => enemy.waveIndex),
      ),
    ).toEqual(new Set([1]));
    expect(
      sim.enemies
        .filter((enemy) => enemy.waveIndex === 1)
        .every((enemy) => enemy.scatterVelocity),
    ).toBe(true);

    while (sim.railDistance < SECTION_SPAN * 2 + 1) {
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 30);
    }
    expect(sim.boss).toBeDefined();
    expect(sim.boss!.railDistance - sim.railDistance).toBeGreaterThan(135);
    expect(sim.boss!.railDistance - sim.railDistance).toBeLessThan(150);
  });

  it("keeps standard durability and projectile damage readable across levels", () => {
    const first = new FlightSimulation({ level: 1 });
    const third = new FlightSimulation({ level: 3 });
    expect(first.enemies[0].maxHealth).toBeCloseTo(1);
    expect(third.enemies[0].maxHealth).toBeCloseTo(1);

    const second = new FlightSimulation({ level: 2 });
    second.enemies.length = 0;
    second.projectiles.length = 0;
    second.enemies.push({
      id: 9999,
      enemyId: "riftspike",
      position: railOffsetPosition(100, 0, 4),
      radius: 1.25,
      railDistance: 100,
      offsetX: 0,
      offsetY: 4,
      phase: 0,
      waveIndex: 0,
      controller: "standard",
      controllerState: {
        decisionCooldown: 1,
        fireCooldown: 0,
        desiredX: 0,
        desiredY: 0,
        desiredDepthSpeed: 0,
      },
    });
    for (let frame = 0; frame < 90; frame++)
      second.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);
    expect(
      second.projectiles.find((shot) => shot.owner === "enemy")?.damage,
    ).toBeCloseTo(0.75);
  });

  it("can force every enemy to one-shot health for transition testing", () => {
    const sim = new FlightSimulation({ level: 6, oneShotEnemies: true });

    expect(sim.enemies.length).toBeGreaterThan(0);
    expect(sim.enemies.every((enemy) => enemy.health === 1)).toBe(true);
    expect(sim.enemies.every((enemy) => enemy.maxHealth === 1)).toBe(true);
  });
});
