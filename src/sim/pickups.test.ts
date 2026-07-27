import { describe, expect, it } from "vitest";
import type { LevelEnemyPlan } from "../enemies";
import {
  PICKUP_IDS,
  PICKUP_DROP_CHANCE,
  PICKUP_EFFECTS,
  TACTICAL_PICKUP_IDS,
  TIMED_PICKUP_IDS,
  type PickupId,
} from "../pickups";
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

function activate(sim: FlightSimulation) {
  sim.step({ ...command, activatePickup: true }, 0);
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
  it("averages one drop across a five-enemy standard encounter", () => {
    expect(PICKUP_DROP_CHANCE * 5).toBe(1);
  });

  it("applies instant pickups when collected", () => {
    const shield = new FlightSimulation({
      enemyPlan: noEnemies,
      shield: 2,
      pickupDropChance: 0,
    });
    collect(shield, "shield");
    expect(shield.player.shield).toBe(4);

    const missiles = new FlightSimulation({
      enemyPlan: noEnemies,
      pickupDropChance: 0,
    });
    collect(missiles, "homing-missiles");
    expect(missiles.player.homingMissiles).toBe(
      3 + PICKUP_EFFECTS.homingMissileAmmo,
    );
  });

  it("stores timed pickups until the player activates them", () => {
    for (const pickupId of TIMED_PICKUP_IDS) {
      const sim = new FlightSimulation({
        enemyPlan: noEnemies,
        pickupDropChance: 0,
      });
      collect(sim, pickupId);
      expect(sim.player.heldPickup, pickupId).toBe(pickupId);
      expect(sim.activePickup, pickupId).toBeUndefined();

      activate(sim);

      expect(sim.player.heldPickup, pickupId).toBeNull();
      expect(sim.activePickup, pickupId).toEqual({
        pickupId,
        timeRemaining: PICKUP_EFFECTS.timedDuration,
      });
    }
  });

  it("holds one reserve pickup and allows another only after activation", () => {
    const sim = new FlightSimulation({
      enemyPlan: noEnemies,
      pickupDropChance: 0,
    });
    collect(sim, "rapid-fire");
    collect(sim, "spread-shot");

    expect(sim.player.heldPickup).toBe("rapid-fire");
    expect(sim.pickups).toEqual([
      expect.objectContaining({ pickupId: "spread-shot" }),
    ]);

    activate(sim);
    sim.step(command, 0);

    expect(sim.activePickup?.pickupId).toBe("rapid-fire");
    expect(sim.player.heldPickup).toBe("spread-shot");

    activate(sim);
    expect(sim.activePickup?.pickupId).toBe("rapid-fire");
    expect(sim.player.heldPickup).toBe("spread-shot");

    sim.step(command, PICKUP_EFFECTS.timedDuration);
    activate(sim);
    expect(sim.activePickup?.pickupId).toBe("spread-shot");
    expect(sim.player.heldPickup).toBeNull();
  });

  it("pulls nearby pickups toward the player and leaves distant pickups still", () => {
    const sim = new FlightSimulation({
      enemyPlan: noEnemies,
      pickupDropChance: 0,
    });
    sim.spawnPickup("rapid-fire", { x: 0, y: 4, z: 10 });
    sim.spawnPickup("spread-shot", { x: 0, y: 4, z: 30 });
    const near = sim.pickups[0];
    const far = sim.pickups[1];

    sim.step(command, 1 / 60);

    expect(near.position.z).toBeLessThan(10);
    expect(far.position).toEqual({ x: 0, y: 4, z: 30 });
  });

  it("drops from the full pickup pool on a configured enemy kill", () => {
    expect(TACTICAL_PICKUP_IDS).toEqual(PICKUP_IDS);
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
        pickupId: TACTICAL_PICKUP_IDS[3],
        position: target.position,
      }),
    ]);
  });

  it("keeps the weapon boosts distinct instead of stacking them", () => {
    const rapid = new FlightSimulation({ pickupDropChance: 0 });
    rapid.enemies.length = 0;
    collect(rapid, "rapid-fire");
    activate(rapid);
    expect(rapid.step({ ...command, fire: true }, 0).shotsFired).toBe(1);
    expect(rapid.step({ ...command, fire: true }, 0.12).shotsFired).toBe(1);

    const spread = new FlightSimulation({ pickupDropChance: 0 });
    spread.enemies.length = 0;
    collect(spread, "spread-shot");
    activate(spread);
    expect(spread.step({ ...command, fire: true }, 0).shotsFired).toBe(3);
    expect(
      spread.projectiles
        .filter((shot) => shot.kind === "bolt")
        .every((shot) => shot.damage === PICKUP_EFFECTS.spreadShotDamage),
    ).toBe(true);

    const overcharged = new FlightSimulation({ pickupDropChance: 0 });
    overcharged.enemies.length = 0;
    collect(overcharged, "overcharged-bolts");
    activate(overcharged);
    expect(overcharged.step({ ...command, fire: true }, 0).shotsFired).toBe(1);
    expect(overcharged.projectiles).toEqual([
      expect.objectContaining({
        kind: "bolt",
        overcharged: true,
        damage: PICKUP_EFFECTS.overchargedBoltDamageMultiplier,
      }),
    ]);
  });

  it("caps missile ammo and preserves reserved resources at construction", () => {
    const sim = new FlightSimulation({
      enemyPlan: noEnemies,
      homingMissiles: 6,
      heldPickup: "chain-lightning",
      pickupDropChance: 0,
    });
    collect(sim, "homing-missiles");

    expect(sim.player.homingMissiles).toBe(PICKUP_EFFECTS.maxHomingMissiles);
    expect(sim.player.heldPickup).toBe("chain-lightning");
  });

  it("steers homing missiles and chains damage through nearby enemies", () => {
    const homing = new FlightSimulation({ pickupDropChance: 0 });
    homing.enemies.length = 0;
    collect(homing, "homing-missiles");
    const homingTarget = enemy(9_101, 9, 45);
    homingTarget.scatterVelocity = undefined;
    homing.enemies.push(homingTarget);
    for (let frame = 0; frame < 24; frame++)
      homing.step({ ...command, secondary: true }, 1 / 60);
    homing.step({ ...command, secondary: false }, 0);
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
    activate(chain);
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
    activate(sim);
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
