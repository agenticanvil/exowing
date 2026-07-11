import { describe, expect, it } from 'vitest';
import { FlightSimulation } from './flightSimulation';
import { railOffsetPosition, SECTION_LENGTH } from './railSystem';
import type { EnemyState } from './types';

describe('FlightSimulation', () => {
  it('moves deterministically and keeps the player inside the flight window', () => {
    const first = new FlightSimulation();
    const second = new FlightSimulation();
    for (let i = 0; i < 120; i++) {
      const command = { steerX: 1, steerY: 1, fire: false, pace: 0 };
      first.step(command, 1 / 60);
      second.step(command, 1 / 60);
    }
    expect(first.player).toEqual(second.player);
    expect(first.player.offsetX).toBe(14);
    expect(first.player.offsetY).toBe(13);
    expect(first.railDistance).toBeCloseTo(30);
  });

  it('removes a sphere enemy hit by a straight projectile', () => {
    const sim = new FlightSimulation();
    sim.enemies.length = 0;
    sim.enemies.push({ id: 999, position: railOffsetPosition(40, 0, 4), radius: 1.25, railDistance: 40, offsetX: 0, offsetY: 4, phase: 0, sectionIndex: 0, controller: 'formation' });
    for (let i = 0; i < 90; i++) sim.step({ steerX: 0, steerY: 0, fire: i === 0, pace: 0 }, 1 / 60);
    expect(sim.enemies.some((enemy) => enemy.id === 999)).toBe(false);
    expect(sim.score).toBeGreaterThan(0);
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
    const sim = new FlightSimulation();
    for (let i = 0; i < 60 * 100; i++) sim.step({ steerX: 0, steerY: 0, fire: false, pace: 1 }, 1 / 60);
    expect(sim.railDistance).toBeGreaterThan(SECTION_LENGTH * 5);
    expect(sim.islands.length).toBeGreaterThan(3);
    expect(sim.islands.length).toBeLessThan(10);
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
});
