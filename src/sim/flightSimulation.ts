import type {
  EnemyDestructionState,
  EnemyState,
  FlightStepResult,
  PlayerCommand,
  PlayerState,
  ProjectileState,
} from "./types";
import {
  railFrameAtDistance,
  railOffsetPosition,
  RAIL_SPEED,
} from "./railSystem";
import { controlEnemy } from "./enemyControllers";
import { createWorld, type WorldRuntime } from "../world/worldSystem";
import { distanceSquared, sweptSpheresIntersect } from "./collision";
import { removeWhere } from "../core/collections";
import type { FlightEventSink } from "../game/flightEvents";
import { ENEMY_MIN_PLAYER_DISTANCE } from "../game/flightDistances";
import {
  ENEMIES,
  type EnemyGroupDefinition,
  type EnemyWaveDefinition,
  type LevelEnemyPlan,
} from "../enemies";
import { createStandardEnemyPlan } from "../game/enemyEncounters";

const PLAYER_SPEED = 12;
export const BARREL_ROLL_DURATION = 0.5;
const BARREL_ROLL_SPEED = 18.5;
const SHOT_SPEED = 102;
const FIRE_INTERVAL = 0.18;
const SLOW_RAIL_SPEED = 6;
const FAST_RAIL_SPEED = 25;
const PACE_RAMP_RATE = 14;
const ENEMY_CLEANUP_MARGIN = 180;
export const ENEMY_DESTRUCTION_DURATION = 1.25;
export const BOSS_DESTRUCTION_DURATION = 1.8;
export const FLIGHT_WINDOW = {
  maxX: 14,
  minY: 0.8,
  maxY: 13,
  cameraPadding: 1.8,
} as const;

export class FlightSimulation {
  readonly player: PlayerState;
  readonly enemies: EnemyState[] = [];
  readonly enemyDestructions: EnemyDestructionState[] = [];
  readonly projectiles: ProjectileState[] = [];
  readonly world: WorldRuntime;
  railDistance = 0;
  railSpeed = RAIL_SPEED;
  score: number;
  invulnerable = false;
  private nextId = 1;
  private fireCooldown = 0;
  private elapsed = 0;
  private readonly difficultyMultiplier: number;
  private spawnedWaves = 0;
  private completed = false;
  private rollTimeRemaining = 0;
  private readonly events?: FlightEventSink;
  private readonly enemyPlan: LevelEnemyPlan;
  private readonly oneShotEnemies: boolean;

  constructor(
    options: {
      shield?: number;
      score?: number;
      level?: number;
      enemyPlan?: LevelEnemyPlan;
      oneShotEnemies?: boolean;
      world?: WorldRuntime;
      events?: FlightEventSink;
    } = {},
  ) {
    this.player = {
      offsetX: 0,
      offsetY: 4,
      velocityX: 0,
      velocityY: 0,
      shield: options.shield ?? 5,
      rollDirection: 0,
      rollProgress: 0,
    };
    this.score = options.score ?? 0;
    this.difficultyMultiplier = 1.2 ** Math.max(0, (options.level ?? 1) - 1);
    this.enemyPlan = options.enemyPlan ?? createStandardEnemyPlan("riftspike");
    this.oneShotEnemies = options.oneShotEnemies ?? false;
    this.world = options.world ?? createWorld([]);
    this.events = options.events;
    this.streamCombat();
    this.world.step(this.railDistance);
  }

  get boss() {
    return this.enemies.find((enemy) => enemy.kind === "boss");
  }

  step(command: PlayerCommand, dt: number): FlightStepResult {
    const result: FlightStepResult = {
      shotsFired: 0,
      enemyHits: 0,
      kills: 0,
      scoreDelta: 0,
      playerHits: 0,
      bossDefeated: false,
      levelComplete: false,
    };
    const targetRailSpeed =
      command.pace > 0
        ? FAST_RAIL_SPEED
        : command.pace < 0
          ? SLOW_RAIL_SPEED
          : RAIL_SPEED;
    this.railSpeed = moveTowards(
      this.railSpeed,
      targetRailSpeed,
      PACE_RAMP_RATE * dt,
    );
    this.railDistance += this.railSpeed * dt;
    this.elapsed += dt;
    for (const destruction of this.enemyDestructions) destruction.age += dt;
    removeWhere(
      this.enemyDestructions,
      (destruction) => destruction.age >= destruction.duration,
    );
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.streamCombat();
    this.world.step(this.railDistance);

    if (this.rollTimeRemaining === 0 && (command.roll ?? 0) !== 0) {
      this.player.rollDirection = Math.sign(command.roll ?? 0);
      this.player.rollProgress = 0;
      this.rollTimeRemaining = BARREL_ROLL_DURATION;
    }
    const isRolling = this.rollTimeRemaining > 0;
    this.player.velocityX = isRolling
      ? this.player.rollDirection * BARREL_ROLL_SPEED
      : command.steerX * PLAYER_SPEED;
    this.player.velocityY = command.steerY * PLAYER_SPEED;
    const lateralDt = isRolling ? Math.min(dt, this.rollTimeRemaining) : dt;
    this.player.offsetX = clamp(
      this.player.offsetX + this.player.velocityX * lateralDt,
      -FLIGHT_WINDOW.maxX,
      FLIGHT_WINDOW.maxX,
    );
    this.player.offsetY = clamp(
      this.player.offsetY + this.player.velocityY * dt,
      FLIGHT_WINDOW.minY,
      FLIGHT_WINDOW.maxY,
    );
    if (isRolling) {
      this.rollTimeRemaining = Math.max(0, this.rollTimeRemaining - dt);
      this.player.rollProgress = Math.min(
        1,
        1 - this.rollTimeRemaining / BARREL_ROLL_DURATION,
      );
    }

    if (command.fire && this.fireCooldown === 0) {
      const rail = railFrameAtDistance(this.railDistance);
      const position = railOffsetPosition(
        this.railDistance + 2,
        this.player.offsetX,
        this.player.offsetY,
      );
      this.projectiles.push({
        id: this.nextId++,
        position,
        velocity: {
          x: rail.forward.x * SHOT_SPEED,
          y: 0,
          z: rail.forward.z * SHOT_SPEED,
        },
        radius: 0.3,
        owner: "player",
      });
      this.fireCooldown = FIRE_INTERVAL;
      result.shotsFired = 1;
      this.events?.emit({ type: "player-fired" });
    }

    const previousShotPositions = new Map(
      this.projectiles.map((shot) => [shot.id, { ...shot.position }]),
    );
    const previousEnemyPositions = new Map(
      this.enemies.map((enemy) => [enemy.id, { ...enemy.position }]),
    );
    for (const enemy of this.enemies)
      enemy.hitFlash = Math.max(0, (enemy.hitFlash ?? 0) - dt * 5);
    for (const shot of this.projectiles) {
      shot.position.x += shot.velocity.x * dt;
      shot.position.y += shot.velocity.y * dt;
      shot.position.z += shot.velocity.z * dt;
    }
    this.updateEnemies(dt);

    const hitShots = new Set<number>();
    const damagedEnemies = new Set<number>();
    for (const shot of this.projectiles) {
      if (shot.owner !== "player") continue;
      const previousShotPosition =
        previousShotPositions.get(shot.id) ?? shot.position;
      if (this.world.projectileCollides(previousShotPosition, shot.position))
        hitShots.add(shot.id);
    }
    for (const shot of this.projectiles)
      for (const enemy of this.enemies) {
        if (hitShots.has(shot.id) || shot.owner !== "player") continue;
        const radius = shot.radius + enemy.radius;
        const previousShotPosition =
          previousShotPositions.get(shot.id) ?? shot.position;
        const previousEnemyPosition =
          previousEnemyPositions.get(enemy.id) ?? enemy.position;
        if (
          sweptSpheresIntersect(
            previousShotPosition,
            shot.position,
            previousEnemyPosition,
            enemy.position,
            radius,
          )
        ) {
          hitShots.add(shot.id);
          damagedEnemies.add(enemy.id);
          break;
        }
      }

    const killedEnemies = new Set<number>();
    for (const enemy of this.enemies)
      if (damagedEnemies.has(enemy.id)) {
        enemy.health = (enemy.health ?? 1) - 1;
        enemy.hitFlash = 1;
        if (enemy.health <= 0) {
          killedEnemies.add(enemy.id);
          this.enemyDestructions.push({
            id: enemy.id,
            enemyId: enemy.enemyId,
            position: { ...enemy.position },
            radius: enemy.radius,
            kind: enemy.kind ?? "standard",
            age: 0,
            duration: ENEMIES[enemy.enemyId].destructionDuration,
          });
          if (enemy.kind === "boss") result.bossDefeated = true;
        }
      }

    const playerWorld = railOffsetPosition(
      this.railDistance,
      this.player.offsetX,
      this.player.offsetY,
    );
    for (const enemy of this.enemies)
      if (killedEnemies.has(enemy.id))
        this.events?.emit({
          type: "enemy-exploded",
          position: { ...enemy.position },
          listenerPosition: { ...playerWorld },
        });
    result.scoreDelta = this.enemies
      .filter((enemy) => killedEnemies.has(enemy.id))
      .reduce((total, enemy) => total + ENEMIES[enemy.enemyId].score, 0);
    let damageTaken = 0;
    for (const shot of this.projectiles)
      if (
        !isRolling &&
        !hitShots.has(shot.id) &&
        shot.owner === "enemy" &&
        distanceSquared(shot.position, playerWorld) <= (shot.radius + 0.9) ** 2
      ) {
        hitShots.add(shot.id);
        result.playerHits++;
        damageTaken += shot.damage ?? 1;
      }
    removeWhere(
      this.projectiles,
      (shot) =>
        hitShots.has(shot.id) ||
        distanceSquared(shot.position, playerWorld) > 150 * 150,
    );
    removeWhere(
      this.enemies,
      (enemy) =>
        killedEnemies.has(enemy.id) ||
        enemy.railDistance < this.railDistance - ENEMY_CLEANUP_MARGIN ||
        distanceSquared(enemy.position, playerWorld) > 260 * 260,
    );
    result.enemyHits = damagedEnemies.size;
    result.kills = killedEnemies.size;
    this.score += result.scoreDelta;
    if (
      !this.completed &&
      this.spawnedWaves === this.enemyPlan.waves.length &&
      this.enemyPlan.waves.every((_, index) => this.isWaveResolved(index))
    ) {
      this.completed = true;
      result.levelComplete = true;
    }
    if (result.levelComplete) {
      result.playerHits = 0;
      removeWhere(this.projectiles, (shot) => shot.owner === "enemy");
    } else if (!this.invulnerable) {
      this.player.shield = Math.max(0, this.player.shield - damageTaken);
    }
    return result;
  }

  private streamCombat() {
    while (this.spawnedWaves < this.enemyPlan.waves.length) {
      const wave = this.enemyPlan.waves[this.spawnedWaves];
      if (this.railDistance < wave.spawnAtRailDistance) break;
      if (
        wave.requiresPreviousWaveResolved &&
        !this.isWaveResolved(this.spawnedWaves - 1)
      )
        break;
      this.spawnEnemyWave(this.spawnedWaves, wave);
      this.spawnedWaves++;
    }
  }

  private isWaveResolved(waveIndex: number) {
    if (waveIndex < 0 || waveIndex >= this.spawnedWaves) return false;
    return this.enemies
      .filter((enemy) => enemy.waveIndex === waveIndex)
      .every(
        (enemy) =>
          enemy.kind === "standard" && enemy.scatterVelocity !== undefined,
      );
  }

  private spawnEnemyWave(waveIndex: number, wave: EnemyWaveDefinition) {
    for (const group of wave.groups)
      this.spawnEnemyGroup(waveIndex, wave, group);
  }

  private spawnEnemyGroup(
    waveIndex: number,
    wave: EnemyWaveDefinition,
    group: EnemyGroupDefinition,
  ) {
    const definition = ENEMIES[group.enemy];
    group.formation.forEach(([x, y], index) => {
      const railDistance =
        wave.enemyRailDistance - index * (group.railSpacing ?? 2);
      this.enemies.push({
        id: this.nextId++,
        enemyId: definition.id,
        position: railOffsetPosition(railDistance, x, y),
        radius: definition.radius,
        railDistance,
        offsetX: x,
        offsetY: y,
        phase: waveIndex * 1.7 + (group.phaseOffset ?? 0) + index,
        waveIndex,
        controller: definition.controller,
        kind: definition.kind,
        health: this.oneShotEnemies
          ? 1
          : definition.baseHealth * this.difficultyMultiplier,
        maxHealth: this.oneShotEnemies
          ? 1
          : definition.baseHealth * this.difficultyMultiplier,
        exitRailDistance: wave.exitAtRailDistance,
      });
    });
  }

  private updateEnemies(dt: number) {
    const playerPosition = railOffsetPosition(
      this.railDistance,
      this.player.offsetX,
      this.player.offsetY,
    );
    const playerRail = railFrameAtDistance(this.railDistance);
    const context = {
      elapsed: this.elapsed,
      playerPosition,
      playerVelocity: {
        x:
          playerRail.forward.x * this.railSpeed +
          playerRail.right.x * this.player.velocityX,
        y: this.player.velocityY,
        z:
          playerRail.forward.z * this.railSpeed +
          playerRail.right.z * this.player.velocityX,
      },
      playerRailDistance: this.railDistance,
      playerShots: this.projectiles.filter((shot) => shot.owner === "player"),
      enemies: this.enemies,
    };
    for (const enemy of this.enemies) {
      if (
        enemy.kind !== "boss" &&
        !enemy.scatterVelocity &&
        enemy.exitRailDistance !== undefined &&
        this.railDistance >= enemy.exitRailDistance
      ) {
        const rail = railFrameAtDistance(enemy.railDistance);
        const side = enemy.offsetX < 0 ? -1 : 1;
        enemy.scatterVelocity = {
          x: rail.right.x * side * 18 + rail.forward.x * 8,
          y: 8 + Math.abs(enemy.offsetX),
          z: rail.right.z * side * 18 + rail.forward.z * 8,
        };
      }
      if (enemy.scatterVelocity) {
        enemy.position.x += enemy.scatterVelocity.x * dt;
        enemy.position.y += enemy.scatterVelocity.y * dt;
        enemy.position.z += enemy.scatterVelocity.z * dt;
        continue;
      }
      const control = controlEnemy(enemy, context, dt);
      const definition = ENEMIES[enemy.enemyId];
      const tooClose =
        enemy.railDistance - this.railDistance <= ENEMY_MIN_PLAYER_DISTANCE;
      enemy.offsetX = clamp(
        enemy.offsetX + control.offsetVelocityX * dt,
        -FLIGHT_WINDOW.maxX,
        FLIGHT_WINDOW.maxX,
      );
      enemy.offsetY = clamp(
        enemy.offsetY + control.offsetVelocityY * dt,
        FLIGHT_WINDOW.minY,
        FLIGHT_WINDOW.maxY,
      );
      enemy.railDistance +=
        (tooClose
          ? definition.retreatSpeed +
            (enemy.kind === "boss" ? Math.max(0, control.depthSpeed) : 0)
          : definition.forwardSpeed + control.depthSpeed) * dt;
      enemy.position = railOffsetPosition(
        enemy.railDistance,
        enemy.offsetX,
        enemy.offsetY,
      );
      if (control.fire)
        this.fireEnemyShot(enemy, playerPosition, context.playerVelocity);
    }
  }

  private fireEnemyShot(
    enemy: EnemyState,
    playerPosition: { x: number; y: number; z: number },
    playerVelocity: { x: number; y: number; z: number },
  ) {
    const distance = Math.sqrt(distanceSquared(enemy.position, playerPosition));
    const definition = ENEMIES[enemy.enemyId];
    const shotSpeed = definition.shot.speed;
    const leadTime = Math.min(1.2, distance / shotSpeed);
    const error = Math.sin(enemy.id * 12.9898 + this.elapsed * 2.1) * 2.2;
    const target = {
      x: playerPosition.x + playerVelocity.x * leadTime * 0.35 + error,
      y: playerPosition.y + playerVelocity.y * leadTime * 0.35 + error * 0.35,
      z: playerPosition.z + playerVelocity.z * leadTime * 0.35,
    };
    if (this.world.lineOfFireBlocked(enemy.position, target)) return;
    const dx = target.x - enemy.position.x,
      dy = target.y - enemy.position.y,
      dz = target.z - enemy.position.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    for (const spread of definition.shot.spreads)
      this.projectiles.push({
        id: this.nextId++,
        position: { ...enemy.position },
        velocity: {
          x: (dx / length) * shotSpeed + spread * shotSpeed,
          y: (dy / length) * shotSpeed,
          z: (dz / length) * shotSpeed - spread * shotSpeed * 0.3,
        },
        radius: definition.shot.radius,
        owner: "enemy",
        damage: definition.shot.damage * this.difficultyMultiplier,
      });
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
function moveTowards(value: number, target: number, maxDelta: number) {
  return Math.abs(target - value) <= maxDelta
    ? target
    : value + Math.sign(target - value) * maxDelta;
}
