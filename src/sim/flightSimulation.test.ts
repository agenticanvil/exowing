import { describe, expect, it } from 'vitest';
import { FlightSimulation } from './flightSimulation';
import { railOffsetPosition, SECTION_LENGTH, SECTION_SPAN } from './railSystem';
import type { EnemyState } from './types';
import { islandField, IslandSystem } from '../world/islandSystem';
import { createWorld } from '../world/worldSystem';

const islandWorld = () => createWorld([islandField({ style: 'weathered', color: 0x8b714d })]);

describe('FlightSimulation', () => {
  it('moves deterministically and keeps the player inside the flight window', () => {
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

  it('barrel rolls laterally, stays in bounds, and dodges hostile shots', () => {
    const sim = new FlightSimulation();
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    sim.projectiles.push({
      id: 9999, position: railOffsetPosition(0, 0, 4), velocity: { x: 0, y: 0, z: 0 },
      radius: 2, owner: 'enemy',
    });

    const result = sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0, roll: 1 }, 1 / 60);
    expect(result.playerHits).toBe(0);
    expect(sim.player.health).toBe(5);
    expect(sim.player.offsetX).toBeGreaterThan(0);
    expect(sim.player.rollDirection).toBe(1);

    for (let i = 0; i < 60; i++) sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0, roll: 0 }, 1 / 60);
    expect(sim.player.offsetX).toBeCloseTo(9.25);
    expect(sim.player.offsetX).toBeLessThanOrEqual(14);
    expect(sim.player.rollDirection).toBe(1);
    expect(sim.player.rollProgress).toBe(1);
  });

  it('removes a sphere enemy hit by a straight projectile', () => {
    const sim = new FlightSimulation({ world: islandWorld() });
    sim.enemies.length = 0;
    sim.enemies.push({ id: 999, position: railOffsetPosition(40, 0, 4), radius: 1.25, railDistance: 40, offsetX: 0, offsetY: 4, phase: 0, sectionIndex: 0, controller: 'formation' });
    for (let i = 0; i < 90; i++) sim.step({ steerX: 0, steerY: 0, fire: i === 0, pace: 0 }, 1 / 60);
    expect(sim.enemies.some((enemy) => enemy.id === 999)).toBe(false);
    expect(sim.score).toBeGreaterThan(0);
  });

  it('detects swept projectile hits between frames without accepting a near miss', () => {
    const createSim = (shotY: number) => {
      const sim = new FlightSimulation();
      sim.enemies.length = 0;
      sim.projectiles.length = 0;
      sim.enemies.push({
        id: 999, position: { x: 0, y: 4, z: 0 }, radius: 1.25, railDistance: 0,
        offsetX: 0, offsetY: 4, phase: 0, sectionIndex: 0, controller: 'formation',
        scatterVelocity: { x: 0, y: 0, z: 0 },
      });
      sim.projectiles.push({
        id: 1000, position: { x: -5, y: shotY, z: 0 }, velocity: { x: 100, y: 0, z: 0 },
        radius: 0.3, owner: 'player',
      });
      return sim;
    };

    const hit = createSim(4);
    expect(hit.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 0.1).enemyHits).toBe(1);

    const nearMiss = createSim(5.56);
    expect(nearMiss.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 0.1).enemyHits).toBe(0);
    expect(nearMiss.enemies.some((enemy) => enemy.id === 999)).toBe(true);
  });

  it('smoothly accelerates and brakes without jumping to the target pace', () => {
    const sim = new FlightSimulation();
    sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 60);
    expect(sim.railSpeed).toBeGreaterThan(15);
    expect(sim.railSpeed).toBeLessThan(25);

    for (let i = 0; i < 60; i++) sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 60);
    expect(sim.railSpeed).toBe(25);

    sim.step({ steerX: 0, steerY: 0, fire: false, pace: -1 }, 1 / 60);
    expect(sim.railSpeed).toBeLessThan(25);
    expect(sim.railSpeed).toBeGreaterThan(6);

    for (let i = 0; i < 90; i++) sim.step({ steerX: 0, steerY: 0, fire: false, pace: -1 }, 1 / 60);
    expect(sim.railSpeed).toBe(6);
  });

  it('streams scenery with a bounded live set during long flights', () => {
    const sim = new FlightSimulation({ world: islandWorld() });
    for (let i = 0; i < 60 * 100; i++) sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 60);
    expect(sim.railDistance).toBeGreaterThan(SECTION_LENGTH * 5);
    const islands = sim.world.get<IslandSystem>('islands')!.islands;
    expect(islands.length).toBeGreaterThan(3);
    expect(islands.length).toBeLessThan(10);
  });

  it('does not stream islands when the level has no island scenery system', () => {
    const sim = new FlightSimulation({ world: createWorld([]) });
    for (let i = 0; i < 60 * 20; i++) sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 60);
    expect(sim.world.get('islands')).toBeUndefined();
  });

  it('moves formations along the rail and scatters survivors near the section end', () => {
    const sim = new FlightSimulation();
    const enemy = sim.enemies[0];
    const startDistance = enemy.railDistance;
    for (let i = 0; i < 60; i++) sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);
    expect(enemy.railDistance).toBeGreaterThan(startDistance);
    while (sim.railDistance < SECTION_LENGTH - 40) sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 60);
    expect(enemy.scatterVelocity).toBeDefined();
  });

  it('lets standard enemies vary depth, dodge imperfectly, and return fire', () => {
    const sim = new FlightSimulation();
    const enemy = sim.enemies[0];
    const initialOffsetX = enemy.offsetX;
    const initialSpacing = enemy.railDistance - sim.railDistance;
    for (let i = 0; i < 90; i++) sim.step({ steerX: 0, steerY: 0, fire: i < 20, pace: 0 }, 1 / 60);
    expect(enemy.offsetX).not.toBe(initialOffsetX);
    expect(enemy.railDistance - sim.railDistance).not.toBeCloseTo(initialSpacing - (15 - 7) * 1.5);
    expect(sim.projectiles.some((shot) => shot.owner === 'enemy')).toBe(true);
  });

  it('stops attacking and retreats down the rail without scattering when too close', () => {
    const sim = new FlightSimulation();
    sim.enemies.length = 0;
    sim.projectiles.length = 0;
    const enemy: EnemyState = { id: 997, position: railOffsetPosition(13, 0, 4), radius: 1.25, railDistance: 13, offsetX: 0, offsetY: 4, phase: 0, sectionIndex: 0, controller: 'standard' };
    sim.enemies.push(enemy);
    sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);
    expect(enemy.scatterVelocity).toBeUndefined();
    expect(enemy.railDistance - sim.railDistance).toBeGreaterThan(13);
    expect(sim.projectiles.some((shot) => shot.owner === 'enemy')).toBe(false);
    for (let i = 0; i < 30; i++) sim.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);
    expect(sim.enemies).toContain(enemy);
  });

  it('requires repeated hits to defeat a boss and reports level completion', () => {
    const sim = new FlightSimulation();
    sim.enemies.length = 0;
    const boss: EnemyState = {
      id: 998, position: railOffsetPosition(40, 0, 4), radius: 3.5,
      railDistance: 40, offsetX: 0, offsetY: 4, phase: 0, sectionIndex: 2,
      controller: 'formation', kind: 'boss', health: 2, maxHealth: 2,
    };
    sim.enemies.push(boss);

    let completed = false;
    for (let frame = 0; frame < 180 && !completed; frame++) {
      const result = sim.step({ steerX: 0, steerY: 0, fire: frame % 20 === 0, pace: 0 }, 1 / 60);
      completed = result.bossDefeated;
    }
    expect(completed).toBe(true);
    expect(sim.enemies).not.toContain(boss);
    expect(sim.score).toBeGreaterThanOrEqual(2500);
  });

  it('waits until the second wave resolves and the second turn ends before spawning the boss', () => {
    const sim = new FlightSimulation();
    sim.invulnerable = true;
    while (sim.railDistance < SECTION_SPAN * 2 - 1) {
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 30);
    }
    expect(sim.boss).toBeUndefined();
    expect(new Set(sim.enemies.filter((enemy) => enemy.kind !== 'boss').map((enemy) => enemy.sectionIndex)))
      .toEqual(new Set([1]));
    expect(sim.enemies.filter((enemy) => enemy.sectionIndex === 1).every((enemy) => enemy.scatterVelocity)).toBe(true);

    while (sim.railDistance < SECTION_SPAN * 2 + 1) {
      sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 30);
    }
    expect(sim.boss).toBeDefined();
    expect(sim.boss!.railDistance - sim.railDistance).toBeGreaterThan(100);
    expect(sim.boss!.railDistance - sim.railDistance).toBeLessThan(140);
  });

  it('compounds enemy health and hostile damage by twenty percent per level', () => {
    const first = new FlightSimulation({ level: 1 });
    const third = new FlightSimulation({ level: 3 });
    expect(first.enemies[0].maxHealth).toBeCloseTo(1);
    expect(third.enemies[0].maxHealth).toBeCloseTo(1.44);

    const second = new FlightSimulation({ level: 2 });
    second.enemies.length = 0;
    second.projectiles.push({
      id: 9999, position: railOffsetPosition(0, 0, 4), velocity: { x: 0, y: 0, z: 0 },
      radius: 2, owner: 'enemy', damage: 1.2,
    });
    second.step({ steerX: 0, steerY: 0, fire: false, pace: 0 }, 1 / 60);
    expect(second.player.health).toBeCloseTo(3.8);
  });
});
