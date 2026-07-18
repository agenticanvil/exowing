import { describe, expect, it } from "vitest";
import type { LevelEnemyPlan } from "../enemies";
import { PICKUP_EFFECTS, PICKUP_IDS, type PickupId } from "../pickups";
import { FlightSimulation } from "./flightSimulation";
import { railOffsetPosition } from "./railSystem";
import type { EnemyState } from "./types";

const noEnemies = { waves: [] } satisfies LevelEnemyPlan;
const command = { steerX: 0, steerY: 0, fire: false, pace: 0 } as const;

function collect(sim: FlightSimulation, pickupId: PickupId) {
  sim.spawnPickup(
    pickupId,
    railOffsetPosition(
      sim.railDistance,
      sim.player.offsetX,
      sim.player.offsetY,
    ),
  );
  sim.step(command, 0);
}

function enemy(id: number, x: number, z: number): EnemyState {
  return {
    id,
    enemyId: "riftspike",
    position: { x, y: 4, z },
    radius: 1.25,
    railDistance: z,
    offsetX: -x,
    offsetY: 4,
    phase: 0,
    waveIndex: 0,
    controller: "formation",
    health: 2,
    maxHealth: 2,
    scatterVelocity: { x: 0, y: 0, z: 0 },
  };
}

describe("pickups", () => {
  it("applies every pickup type when collected", () => {
    const shield = new FlightSimulation({
      enemyPlan: noEnemies,
      shield: 2,
      pickupDropChance: 0,
    });
    collect(shield, "shield");
    expect(shield.player.shield).toBe(4);

    const expectedEffects: Array<
      readonly [PickupId, keyof FlightSimulation["player"], number]
    > = [
      ["overshield", "overshield", PICKUP_EFFECTS.overshieldAmount],
      [
        "rapid-fire",
        "rapidFireTimeRemaining",
        PICKUP_EFFECTS.rapidFireDuration,
      ],
      [
        "overcharged-bolts",
        "overchargedBoltsTimeRemaining",
        PICKUP_EFFECTS.overchargedBoltsDuration,
      ],
      [
        "spread-shot",
        "spreadShotTimeRemaining",
        PICKUP_EFFECTS.spreadShotDuration,
      ],
      ["homing-missiles", "homingMissiles", PICKUP_EFFECTS.homingMissileAmmo],
      [
        "chain-lightning",
        "chainLightningTimeRemaining",
        PICKUP_EFFECTS.chainLightningDuration,
      ],
    ];
    for (const [pickupId, property, expected] of expectedEffects) {
      const sim = new FlightSimulation({
        enemyPlan: noEnemies,
        pickupDropChance: 0,
      });
      collect(sim, pickupId);
      expect(sim.player[property], pickupId).toBe(expected);
    }
  });

  it("pulls nearby pickups toward the player and leaves distant pickups still", () => {
    const sim = new FlightSimulation({
      enemyPlan: noEnemies,
      pickupDropChance: 0,
    });
    sim.spawnPickup("shield", { x: 0, y: 4, z: 10 });
    sim.spawnPickup("rapid-fire", { x: 0, y: 4, z: 30 });
    const near = sim.pickups[0];
    const far = sim.pickups[1];

    sim.step(command, 1 / 60);

    expect(near.position.z).toBeLessThan(10);
    expect(far.position).toEqual({ x: 0, y: 4, z: 30 });
  });

  it("drops a uniformly selected pickup on a configured enemy kill", () => {
    const randomValues = [0.1, 0.5];
    const sim = new FlightSimulation({
      pickupDropChance: 1,
      random: () => randomValues.shift() ?? 0,
    });
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    const target = enemy(9_001, 0, 20);
    target.health = 1;
    sim.enemies.push(target);
    sim.projectiles.push({
      id: 9_002,
      position: { ...target.position },
      velocity: { x: 0, y: 0, z: 0 },
      radius: 0.3,
      owner: "player",
    });

    sim.step(command, 0);

    expect(sim.pickups).toEqual([
      expect.objectContaining({
        pickupId: PICKUP_IDS[3],
        position: target.position,
      }),
    ]);
  });

  it("creates rapid, spread, overcharged fire and limited homing missiles", () => {
    const sim = new FlightSimulation({ pickupDropChance: 0 });
    sim.enemies.length = 0;
    collect(sim, "rapid-fire");
    collect(sim, "spread-shot");
    collect(sim, "overcharged-bolts");
    collect(sim, "homing-missiles");

    const first = sim.step({ ...command, fire: true }, 0);
    expect(first.shotsFired).toBe(4);
    expect(sim.projectiles.filter((shot) => shot.kind === "bolt")).toHaveLength(
      3,
    );
    expect(
      sim.projectiles
        .filter((shot) => shot.kind === "bolt")
        .every((shot) => shot.overcharged && shot.damage === 3),
    ).toBe(true);
    expect(
      sim.projectiles.filter((shot) => shot.kind === "homing-missile"),
    ).toHaveLength(1);
    expect(sim.player.homingMissiles).toBe(
      PICKUP_EFFECTS.homingMissileAmmo - 1,
    );

    const second = sim.step({ ...command, fire: true }, 0.09);
    expect(second.shotsFired).toBe(4);
  });

  it("steers homing missiles and chains damage through nearby enemies", () => {
    const homing = new FlightSimulation({ pickupDropChance: 0 });
    homing.enemies.length = 0;
    collect(homing, "homing-missiles");
    homing.enemies.push(enemy(9_101, 9, 45));
    homing.step({ ...command, fire: true }, 0);
    const missile = homing.projectiles.find(
      (projectile) => projectile.kind === "homing-missile",
    )!;
    const initialX = missile.velocity.x;
    homing.step(command, 1 / 60);
    expect(missile.velocity.x).not.toBe(initialX);

    const chain = new FlightSimulation({ pickupDropChance: 0 });
    chain.enemies.length = 0;
    chain.projectiles.length = 0;
    collect(chain, "chain-lightning");
    const targets = [
      enemy(9_201, 0, 30),
      enemy(9_202, 6, 30),
      enemy(9_203, 12, 30),
    ];
    chain.enemies.push(...targets);
    chain.projectiles.push({
      id: 9_204,
      position: { ...targets[0].position },
      velocity: { x: 0, y: 0, z: 0 },
      radius: 0.3,
      owner: "player",
    });

    chain.step(command, 0);

    expect(targets.map((target) => target.health)).toEqual([1, 1, 1]);
    expect(chain.chainLightnings).toEqual([
      expect.objectContaining({
        points: targets.map((target) => target.position),
      }),
    ]);
  });

  it("absorbs damage with overshield before the regular shield", () => {
    const sim = new FlightSimulation({ pickupDropChance: 0 });
    sim.enemies.length = 0;
    collect(sim, "overshield");
    sim.projectiles.push({
      id: 9_301,
      position: railOffsetPosition(0, 0, 4),
      velocity: { x: 0, y: 0, z: 0 },
      radius: 2,
      owner: "enemy",
      damage: 2,
    });

    sim.step(command, 0);

    expect(sim.player.overshield).toBe(1);
    expect(sim.player.shield).toBe(5);
  });
});
