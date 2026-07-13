import type {
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
  SECTION_LENGTH,
  SECTION_SPAN,
} from "./railSystem";
import { controlEnemy } from "./enemyControllers";
import { createWorld, type WorldRuntime } from "../world/worldSystem";
import { distanceSquared, sweptSpheresIntersect } from "./collision";
import { removeWhere } from "../core/collections";

const PLAYER_SPEED = 12;
export const BARREL_ROLL_DURATION = 0.5;
const BARREL_ROLL_SPEED = 18.5;
const SHOT_SPEED = 68;
const FIRE_INTERVAL = 0.18;
const SLOW_RAIL_SPEED = 6;
const FAST_RAIL_SPEED = 25;
const PACE_RAMP_RATE = 14;
const STREAM_AHEAD = 220;
const ENEMY_CLEANUP_MARGIN = 180;
const ENEMY_SCATTER_LEAD = 42;
const ENEMY_FORWARD_SPEED = 7;
const ENEMY_SHOT_SPEED = 38;
const BOSS_SHOT_SPEED = 48;
const WAVE_OFFSET = 130;
const BOSS_DISTANCE = SECTION_SPAN * 2 + 130;
const BOSS_HEALTH = 24;
export const ENEMY_MIN_PLAYER_DISTANCE = 14;
const ENEMY_RETREAT_SPEED = 32;
export const FLIGHT_WINDOW = {
  maxX: 14,
  minY: 0.8,
  maxY: 13,
  cameraPadding: 1.8,
} as const;

export class FlightSimulation {
  readonly player: PlayerState;
  readonly enemies: EnemyState[] = [];
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
  private bossSpawned = false;
  private rollTimeRemaining = 0;

  constructor(
    options: {
      shield?: number;
      score?: number;
      level?: number;
      world?: WorldRuntime;
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
    this.world = options.world ?? createWorld([]);
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
          if (enemy.kind === "boss") result.bossDefeated = true;
        }
      }

    const playerWorld = railOffsetPosition(
      this.railDistance,
      this.player.offsetX,
      this.player.offsetY,
    );
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
    if (!this.invulnerable)
      this.player.shield = Math.max(0, this.player.shield - damageTaken);
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
    result.scoreDelta =
      (killedEnemies.size - (result.bossDefeated ? 1 : 0)) * 100 +
      (result.bossDefeated ? 2500 : 0);
    this.score += result.scoreDelta;
    return result;
  }

  private streamCombat() {
    while (
      this.spawnedWaves < 2 &&
      this.waveDistance(this.spawnedWaves) <= this.railDistance + STREAM_AHEAD
    ) {
      this.spawnEnemyGroup(
        this.spawnedWaves,
        this.waveDistance(this.spawnedWaves),
      );
      this.spawnedWaves++;
    }
    const secondWaveResolved =
      this.spawnedWaves === 2 &&
      this.enemies
        .filter((enemy) => enemy.kind !== "boss" && enemy.sectionIndex === 1)
        .every((enemy) => enemy.scatterVelocity !== undefined);
    const completedSecondTurn = this.railDistance >= SECTION_SPAN * 2;
    if (!this.bossSpawned && secondWaveResolved && completedSecondTurn) {
      this.spawnBoss();
      this.bossSpawned = true;
    }
  }

  private waveDistance(waveIndex: number) {
    return waveIndex * SECTION_SPAN + WAVE_OFFSET;
  }

  private spawnEnemyGroup(sectionIndex: number, groupDistance: number) {
    const formation = [
      [-5, 5],
      [0, 7],
      [5, 5],
      [-2.5, 3],
      [2.5, 3],
    ];
    formation.forEach(([x, y], index) => {
      this.enemies.push({
        id: this.nextId++,
        position: railOffsetPosition(groupDistance, x, y),
        radius: 1.25,
        railDistance: groupDistance - index * 2,
        offsetX: x,
        offsetY: y,
        phase: sectionIndex * 1.7 + index,
        sectionIndex,
        controller: "standard",
        kind: "standard",
        health: this.difficultyMultiplier,
        maxHealth: this.difficultyMultiplier,
        exitRailDistance:
          sectionIndex * SECTION_SPAN + SECTION_LENGTH - ENEMY_SCATTER_LEAD,
      });
    });
  }

  private spawnBoss() {
    this.enemies.push({
      id: this.nextId++,
      position: railOffsetPosition(BOSS_DISTANCE, 0, 7),
      radius: 3.5,
      railDistance: BOSS_DISTANCE,
      offsetX: 0,
      offsetY: 7,
      phase: 0,
      sectionIndex: 2,
      controller: "boss",
      kind: "boss",
      health: BOSS_HEALTH * this.difficultyMultiplier,
      maxHealth: BOSS_HEALTH * this.difficultyMultiplier,
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
      const scatterAt =
        enemy.exitRailDistance ??
        enemy.sectionIndex * SECTION_SPAN + SECTION_LENGTH - ENEMY_SCATTER_LEAD;
      if (
        enemy.kind !== "boss" &&
        !enemy.scatterVelocity &&
        this.railDistance >= scatterAt
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
          ? ENEMY_RETREAT_SPEED
          : ENEMY_FORWARD_SPEED + control.depthSpeed) * dt;
      enemy.position = railOffsetPosition(
        enemy.railDistance,
        enemy.offsetX,
        enemy.offsetY,
      );
      if (!tooClose && control.fire)
        this.fireEnemyShot(enemy, playerPosition, context.playerVelocity);
    }
  }

  private fireEnemyShot(
    enemy: EnemyState,
    playerPosition: { x: number; y: number; z: number },
    playerVelocity: { x: number; y: number; z: number },
  ) {
    const distance = Math.sqrt(distanceSquared(enemy.position, playerPosition));
    const shotSpeed =
      enemy.kind === "boss" ? BOSS_SHOT_SPEED : ENEMY_SHOT_SPEED;
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
    const spreads = enemy.kind === "boss" ? [-0.12, 0, 0.12] : [0];
    for (const spread of spreads)
      this.projectiles.push({
        id: this.nextId++,
        position: { ...enemy.position },
        velocity: {
          x: (dx / length) * shotSpeed + spread * shotSpeed,
          y: (dy / length) * shotSpeed,
          z: (dz / length) * shotSpeed - spread * shotSpeed * 0.3,
        },
        radius: enemy.kind === "boss" ? 0.34 : 0.26,
        owner: "enemy",
        damage: this.difficultyMultiplier,
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
