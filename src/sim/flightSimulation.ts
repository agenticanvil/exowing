import type {
  ChainLightningState,
  EnemyDestructionState,
  EnemyState,
  FlightStepResult,
  PickupState,
  PlayerCommand,
  PlayerState,
  ProjectileState,
  Vec3,
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
import {
  PICKUP_COLLECTION_DISTANCE,
  PICKUP_DROP_CHANCE,
  PICKUP_EFFECTS,
  PICKUP_IDS,
  PICKUP_MAGNET_DISTANCE,
  type PickupId,
} from "../pickups";

const PLAYER_SPEED = 12;
export const BARREL_ROLL_DURATION = 0.5;
const BARREL_ROLL_SPEED = 18.5;
const SHOT_SPEED = 102;
const FIRE_INTERVAL = 0.18;
const RAPID_FIRE_MULTIPLIER = 0.45;
const PLAYER_SHOT_DAMAGE = 1;
const OVERCHARGED_SHOT_DAMAGE = 3;
const OVERCHARGED_SHOT_RADIUS = 0.48;
const SPREAD_ANGLE = Math.PI / 16;
const HOMING_MISSILE_SPEED = 70;
const HOMING_MISSILE_DAMAGE = 4;
const HOMING_MISSILE_RADIUS = 0.55;
const HOMING_STEERING_RATE = 6;
const CHAIN_LIGHTNING_RANGE = 13;
const CHAIN_LIGHTNING_DAMAGE = 1;
const CHAIN_LIGHTNING_TARGETS = 2;
const CHAIN_LIGHTNING_DURATION = 0.22;
const PICKUP_CLEANUP_DISTANCE = 180;
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
  readonly pickups: PickupState[] = [];
  readonly chainLightnings: ChainLightningState[] = [];
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
  private readonly pickupDropChance: number;
  private readonly random: () => number;
  private readonly damageMultiplier: number;

  constructor(
    options: {
      shield?: number;
      score?: number;
      level?: number;
      enemyPlan?: LevelEnemyPlan;
      oneShotEnemies?: boolean;
      world?: WorldRuntime;
      events?: FlightEventSink;
      pickupDropChance?: number;
      random?: () => number;
    } = {},
  ) {
    this.player = {
      offsetX: 0,
      offsetY: 4,
      velocityX: 0,
      velocityY: 0,
      shield: options.shield ?? 5,
      overshield: 0,
      overshieldTimeRemaining: 0,
      rapidFireTimeRemaining: 0,
      overchargedBoltsTimeRemaining: 0,
      spreadShotTimeRemaining: 0,
      homingMissiles: 0,
      chainLightningTimeRemaining: 0,
      rollDirection: 0,
      rollProgress: 0,
    };
    this.score = options.score ?? 0;
    this.difficultyMultiplier = 1.2 ** Math.max(0, (options.level ?? 1) - 1);
    this.damageMultiplier = 1.12 ** Math.max(0, (options.level ?? 1) - 1);
    this.enemyPlan = options.enemyPlan ?? createStandardEnemyPlan("riftspike");
    this.oneShotEnemies = options.oneShotEnemies ?? false;
    this.world = options.world ?? createWorld([]);
    this.events = options.events;
    this.pickupDropChance = clamp(
      options.pickupDropChance ?? PICKUP_DROP_CHANCE,
      0,
      1,
    );
    this.random = options.random ?? Math.random;
    this.streamCombat();
    this.world.step(this.railDistance);
  }

  get boss() {
    return this.enemies.find((enemy) => enemy.kind === "boss");
  }

  spawnPickup(
    pickupId: PickupId,
    position: { x: number; y: number; z: number },
  ) {
    this.pickups.push({
      id: this.nextId++,
      pickupId,
      position: { ...position },
      age: 0,
    });
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
    for (const pickup of this.pickups) pickup.age += dt;
    for (const lightning of this.chainLightnings) lightning.age += dt;
    removeWhere(
      this.enemyDestructions,
      (destruction) => destruction.age >= destruction.duration,
    );
    removeWhere(
      this.chainLightnings,
      (lightning) => lightning.age >= lightning.duration,
    );
    this.updatePickupEffectTimers(dt);
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

    const playerWorld = railOffsetPosition(
      this.railDistance,
      this.player.offsetX,
      this.player.offsetY,
    );
    this.updatePickups(playerWorld, dt);

    if (command.fire && this.fireCooldown === 0) {
      const rail = railFrameAtDistance(this.railDistance);
      const position = railOffsetPosition(
        this.railDistance + 2,
        this.player.offsetX,
        this.player.offsetY,
      );
      const overcharged = this.player.overchargedBoltsTimeRemaining > 0;
      const shotAngles =
        this.player.spreadShotTimeRemaining > 0
          ? [-SPREAD_ANGLE, 0, SPREAD_ANGLE]
          : [0];
      let firedProjectileCount = shotAngles.length;
      for (const angle of shotAngles) {
        const forwardScale = Math.cos(angle) * SHOT_SPEED;
        const rightScale = Math.sin(angle) * SHOT_SPEED;
        this.projectiles.push({
          id: this.nextId++,
          position: { ...position },
          velocity: {
            x: rail.forward.x * forwardScale + rail.right.x * rightScale,
            y: 0,
            z: rail.forward.z * forwardScale + rail.right.z * rightScale,
          },
          radius: overcharged ? OVERCHARGED_SHOT_RADIUS : 0.3,
          owner: "player",
          damage: overcharged ? OVERCHARGED_SHOT_DAMAGE : PLAYER_SHOT_DAMAGE,
          kind: "bolt",
          overcharged,
        });
      }
      if (this.player.homingMissiles > 0) {
        this.projectiles.push({
          id: this.nextId++,
          position: { ...position },
          velocity: {
            x: rail.forward.x * HOMING_MISSILE_SPEED,
            y: 0,
            z: rail.forward.z * HOMING_MISSILE_SPEED,
          },
          radius: HOMING_MISSILE_RADIUS,
          owner: "player",
          damage: HOMING_MISSILE_DAMAGE,
          kind: "homing-missile",
        });
        this.player.homingMissiles--;
        firedProjectileCount++;
      }
      this.fireCooldown =
        FIRE_INTERVAL *
        (this.player.rapidFireTimeRemaining > 0 ? RAPID_FIRE_MULTIPLIER : 1);
      result.shotsFired = firedProjectileCount;
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
    this.updateHomingProjectiles(dt);
    for (const shot of this.projectiles) {
      shot.position.x += shot.velocity.x * dt;
      shot.position.y += shot.velocity.y * dt;
      shot.position.z += shot.velocity.z * dt;
    }
    this.updateEnemies(dt);

    const hitShots = new Set<number>();
    const damageByEnemy = new Map<number, number>();
    const directHits: Array<{ enemy: EnemyState; shot: ProjectileState }> = [];
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
          damageByEnemy.set(
            enemy.id,
            (damageByEnemy.get(enemy.id) ?? 0) + (shot.damage ?? 1),
          );
          directHits.push({ enemy, shot });
          break;
        }
      }

    if (this.player.chainLightningTimeRemaining > 0)
      for (const { enemy, shot } of directHits)
        if (shot.owner === "player")
          this.strikeChainLightning(enemy, damageByEnemy);

    const killedEnemies = new Set<number>();
    for (const enemy of this.enemies)
      if (damageByEnemy.has(enemy.id)) {
        enemy.health = (enemy.health ?? 1) - (damageByEnemy.get(enemy.id) ?? 0);
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
          this.tryDropPickup(enemy.position);
          if (enemy.kind === "boss") result.bossDefeated = true;
        }
      }

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
    result.enemyHits = damageByEnemy.size;
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
    } else if (!this.invulnerable) this.applyPlayerDamage(damageTaken);
    return result;
  }

  private updatePickupEffectTimers(dt: number) {
    const timedEffects = [
      "rapidFireTimeRemaining",
      "overchargedBoltsTimeRemaining",
      "spreadShotTimeRemaining",
      "chainLightningTimeRemaining",
    ] as const;
    for (const effect of timedEffects)
      this.player[effect] = Math.max(0, this.player[effect] - dt);

    this.player.overshieldTimeRemaining = Math.max(
      0,
      this.player.overshieldTimeRemaining - dt,
    );
    if (this.player.overshieldTimeRemaining === 0) this.player.overshield = 0;
  }

  private updatePickups(playerPosition: Vec3, dt: number) {
    const collected = new Set<number>();
    for (const pickup of this.pickups) {
      const initialDistanceSquared = distanceSquared(
        pickup.position,
        playerPosition,
      );
      if (initialDistanceSquared <= PICKUP_MAGNET_DISTANCE ** 2) {
        const pull = 1 - Math.exp(-8 * dt);
        pickup.position.x += (playerPosition.x - pickup.position.x) * pull;
        pickup.position.y += (playerPosition.y - pickup.position.y) * pull;
        pickup.position.z += (playerPosition.z - pickup.position.z) * pull;
      }
      if (
        distanceSquared(pickup.position, playerPosition) <=
        PICKUP_COLLECTION_DISTANCE ** 2
      ) {
        this.collectPickup(pickup.pickupId);
        collected.add(pickup.id);
      }
    }
    removeWhere(
      this.pickups,
      (pickup) =>
        collected.has(pickup.id) ||
        distanceSquared(pickup.position, playerPosition) >
          PICKUP_CLEANUP_DISTANCE ** 2,
    );
  }

  private collectPickup(pickupId: PickupId) {
    switch (pickupId) {
      case "shield":
        this.player.shield = Math.min(
          5,
          this.player.shield + PICKUP_EFFECTS.shieldRestore,
        );
        break;
      case "overshield":
        this.player.overshield = Math.max(
          this.player.overshield,
          PICKUP_EFFECTS.overshieldAmount,
        );
        this.player.overshieldTimeRemaining = PICKUP_EFFECTS.overshieldDuration;
        break;
      case "rapid-fire":
        this.player.rapidFireTimeRemaining = PICKUP_EFFECTS.rapidFireDuration;
        break;
      case "overcharged-bolts":
        this.player.overchargedBoltsTimeRemaining =
          PICKUP_EFFECTS.overchargedBoltsDuration;
        break;
      case "spread-shot":
        this.player.spreadShotTimeRemaining = PICKUP_EFFECTS.spreadShotDuration;
        break;
      case "homing-missiles":
        this.player.homingMissiles += PICKUP_EFFECTS.homingMissileAmmo;
        break;
      case "chain-lightning":
        this.player.chainLightningTimeRemaining =
          PICKUP_EFFECTS.chainLightningDuration;
        break;
    }
  }

  private tryDropPickup(position: Vec3) {
    if (this.random() >= this.pickupDropChance) return;
    const index = Math.min(
      PICKUP_IDS.length - 1,
      Math.floor(this.random() * PICKUP_IDS.length),
    );
    this.spawnPickup(PICKUP_IDS[index], position);
  }

  private updateHomingProjectiles(dt: number) {
    for (const shot of this.projectiles) {
      if (shot.kind !== "homing-missile" || shot.owner !== "player") continue;
      let target: EnemyState | undefined;
      let nearestDistanceSquared = 120 ** 2;
      for (const enemy of this.enemies) {
        const candidateDistanceSquared = distanceSquared(
          shot.position,
          enemy.position,
        );
        if (candidateDistanceSquared >= nearestDistanceSquared) continue;
        target = enemy;
        nearestDistanceSquared = candidateDistanceSquared;
      }
      if (!target) continue;
      const speed = Math.hypot(
        shot.velocity.x,
        shot.velocity.y,
        shot.velocity.z,
      );
      const dx = target.position.x - shot.position.x;
      const dy = target.position.y - shot.position.y;
      const dz = target.position.z - shot.position.z;
      const distance = Math.hypot(dx, dy, dz) || 1;
      const blend = Math.min(1, HOMING_STEERING_RATE * dt);
      const direction = {
        x:
          shot.velocity.x / speed +
          (dx / distance - shot.velocity.x / speed) * blend,
        y:
          shot.velocity.y / speed +
          (dy / distance - shot.velocity.y / speed) * blend,
        z:
          shot.velocity.z / speed +
          (dz / distance - shot.velocity.z / speed) * blend,
      };
      const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
      shot.velocity.x = (direction.x / length) * speed;
      shot.velocity.y = (direction.y / length) * speed;
      shot.velocity.z = (direction.z / length) * speed;
    }
  }

  private strikeChainLightning(
    primary: EnemyState,
    damageByEnemy: Map<number, number>,
  ) {
    const points = [{ ...primary.position }];
    const struck = new Set([primary.id]);
    let source = primary;
    for (let arc = 0; arc < CHAIN_LIGHTNING_TARGETS; arc++) {
      let target: EnemyState | undefined;
      let nearestDistanceSquared = CHAIN_LIGHTNING_RANGE ** 2;
      for (const enemy of this.enemies) {
        if (struck.has(enemy.id)) continue;
        const candidateDistanceSquared = distanceSquared(
          source.position,
          enemy.position,
        );
        if (candidateDistanceSquared >= nearestDistanceSquared) continue;
        target = enemy;
        nearestDistanceSquared = candidateDistanceSquared;
      }
      if (!target) break;
      struck.add(target.id);
      damageByEnemy.set(
        target.id,
        (damageByEnemy.get(target.id) ?? 0) + CHAIN_LIGHTNING_DAMAGE,
      );
      points.push({ ...target.position });
      source = target;
    }
    if (points.length < 2) return;
    this.chainLightnings.push({
      id: this.nextId++,
      points,
      age: 0,
      duration: CHAIN_LIGHTNING_DURATION,
    });
  }

  private applyPlayerDamage(damage: number) {
    const absorbed = Math.min(this.player.overshield, damage);
    this.player.overshield -= absorbed;
    if (this.player.overshield === 0) this.player.overshieldTimeRemaining = 0;
    this.player.shield = Math.max(0, this.player.shield - (damage - absorbed));
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
    const error =
      Math.sin(enemy.id * 12.9898 + this.elapsed * 2.1) *
      definition.shot.aimError;
    const target = {
      x:
        playerPosition.x +
        playerVelocity.x * leadTime * definition.shot.lead +
        error,
      y:
        playerPosition.y +
        playerVelocity.y * leadTime * definition.shot.lead +
        error * 0.35,
      z: playerPosition.z + playerVelocity.z * leadTime * definition.shot.lead,
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
        damage: definition.shot.damage * this.damageMultiplier,
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
