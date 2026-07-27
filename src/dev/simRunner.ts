import { LEVELS, type LevelId } from "../levels";
import { FlightSimulation } from "../sim/flightSimulation";
import type { PlayerCommand } from "../sim/types";
import { createWorld } from "../world/worldSystem";

type Strategy = "stationary" | "track" | "track-and-evade";

type ScenarioResult = {
  level: LevelId;
  strategy: Strategy;
  completed: boolean;
  seconds: number;
  kills: number;
  accuracy: number;
  damage: number;
  peakEnemies: number;
  peakHostileProjectiles: number;
};

const DT = 1 / 60;
const MAX_SECONDS = 180;

function commandFor(
  simulation: FlightSimulation,
  strategy: Strategy,
  frame: number,
): PlayerCommand {
  if (strategy === "stationary")
    return {
      steerX: 0,
      steerY: 0,
      fire: true,
      secondary: frame % 120 < 70,
      pace: 0,
    };

  const target = simulation.enemies
    .filter((enemy) => !enemy.scatterVelocity)
    .sort(
      (left, right) =>
        left.railDistance - right.railDistance ||
        Math.abs(left.offsetX - simulation.player.offsetX) -
          Math.abs(right.offsetX - simulation.player.offsetX),
    )[0];
  const hostileShots = simulation.projectiles.filter(
    (shot) => shot.owner === "enemy",
  );
  const nearestThreat = hostileShots
    .map((shot) => ({
      shot,
      distance: Math.hypot(
        shot.position.x - simulation.player.offsetX,
        shot.position.y - simulation.player.offsetY,
      ),
    }))
    .sort((left, right) => left.distance - right.distance)[0];
  const evade =
    strategy === "track-and-evade" &&
    nearestThreat &&
    nearestThreat.distance < 3.5
      ? Math.sign(
          simulation.player.offsetX - nearestThreat.shot.position.x || 1,
        ) * 4
      : 0;
  const targetX = (target?.offsetX ?? 0) + evade;
  const targetY = target?.offsetY ?? 4;
  const deltaX = targetX - simulation.player.offsetX;
  const deltaY = targetY - simulation.player.offsetY;
  return {
    steerX: Math.abs(deltaX) < 0.18 ? 0 : Math.sign(deltaX),
    steerY: Math.abs(deltaY) < 0.18 ? 0 : Math.sign(deltaY),
    fire: true,
    secondary: frame % 120 < 70,
    pace: 0,
    roll:
      strategy === "track-and-evade" &&
      nearestThreat?.distance !== undefined &&
      nearestThreat.distance < 1.8 &&
      frame % 45 === 0
        ? Math.sign(deltaX || 1)
        : 0,
  };
}

function run(level: LevelId, strategy: Strategy): ScenarioResult {
  const definition = LEVELS[level];
  const simulation = new FlightSimulation({
    level,
    enemyPlan: definition.enemies,
    world: createWorld(definition.systems),
    pickupDropChance: 0,
    upgrades:
      level >= 5
        ? ["calibrated-emitters", "magnetic-bolts", "faster-lock"]
        : level >= 3
          ? ["calibrated-emitters", "magnetic-bolts"]
          : [],
  });
  let shots = 0;
  let hits = 0;
  let kills = 0;
  let damage = 0;
  let peakEnemies = 0;
  let peakHostileProjectiles = 0;
  let completed = false;
  let frame = 0;

  for (; frame < MAX_SECONDS / DT; frame++) {
    const protectionBefore =
      simulation.player.shield + simulation.player.overshield;
    const result = simulation.step(commandFor(simulation, strategy, frame), DT);
    shots += result.shotsFired;
    hits += result.enemyHits;
    kills += result.kills;
    damage += Math.max(
      0,
      protectionBefore -
        simulation.player.shield -
        simulation.player.overshield,
    );
    peakEnemies = Math.max(peakEnemies, simulation.enemies.length);
    peakHostileProjectiles = Math.max(
      peakHostileProjectiles,
      simulation.projectiles.filter((shot) => shot.owner === "enemy").length,
    );
    if (result.levelComplete) {
      completed = true;
      break;
    }
    if (simulation.player.shield <= 0) break;
  }

  return {
    level,
    strategy,
    completed,
    seconds: Number(((frame + 1) * DT).toFixed(1)),
    kills,
    accuracy: shots === 0 ? 0 : Math.round((hits / shots) * 100),
    damage: Number(damage.toFixed(2)),
    peakEnemies,
    peakHostileProjectiles,
  };
}

const levels = [1, 2, 3, 4, 5, 6] as const;
const strategies = [
  "stationary",
  "track",
  "track-and-evade",
] as const satisfies readonly Strategy[];

console.table(
  levels.flatMap((level) => strategies.map((strategy) => run(level, strategy))),
);
