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
  PICKUP_MAGNET_DISTANCE,
  isTimedPickup,
  TACTICAL_PICKUP_IDS,
  type PickupId,
  type TimedPickupId,
} from "../pickups";
import type { UpgradeId } from "../upgrades";

const PLAYER_SPEED = 12;
export const BARREL_ROLL_DURATION = 0.5;
export const BARREL_ROLL_COOLDOWN = 1;
const PHASE_ROLL_DURATION = 0.6;
const REFLEX_ACTUATOR_COOLDOWN = 0.8;
const BARREL_ROLL_SPEED = 18.5;
const SHOT_SPEED = 102;
const FIRE_INTERVAL = 0.18;
const CALIBRATED_FIRE_MULTIPLIER = 0.85;
const UPGRADE_FIRE_MULTIPLIER = 0.7;
const OVERDRIVE_HITS = 10;
const OVERDRIVE_DURATION = 2.5;
const REFLEX_CORE_DURATION = 2;
const REFLEX_CORE_COOLDOWN = 2;
const REFLEX_TRIGGER_DISTANCE = 5;
const PLAYER_SHOT_DAMAGE = 1;
const PRECISION_DAMAGE_MULTIPLIER = 1.5;
const TWIN_BOLT_DAMAGE = 0.75;
const TWIN_BOLT_ANGLE = Math.PI / 72;
const AIM_ASSIST_CONE = Math.PI / 30;
const AIM_ASSIST_MAX_CORRECTION = Math.PI / 72;
const MAGNETIC_AIM_ASSIST_CONE = Math.PI / 18;
const MAGNETIC_AIM_ASSIST_MAX_CORRECTION = Math.PI / 45;
const PRECISION_CONE = Math.PI / 180;
const OVERCHARGED_SHOT_RADIUS = 0.48;
const SPREAD_ANGLE = Math.PI / 16;
const HOMING_MISSILE_SPEED = 70;
const HOMING_MISSILE_DAMAGE = 4;
const HOMING_MISSILE_RADIUS = 0.55;
const HOMING_STEERING_RATE = 6;
const SALVO_STEERING_MULTIPLIER = 1.2;
const SALVO_RETARGET_RANGE = 25;
const BASE_MISSILE_LOCKS = 3;
const MISSILE_LOCK_INTERVAL = 0.35;
const MISSILE_LOCK_CONE = Math.PI / 12;
const MISSILE_LOCK_RANGE = 145;
const STARTING_MISSILES = 3;
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
  private readonly level: number;
  private spawnedWaves = 0;
  private completed = false;
  private rollTimeRemaining = 0;
  private readonly events?: FlightEventSink;
  private readonly enemyPlan: LevelEnemyPlan;
  private readonly oneShotEnemies: boolean;
  private readonly pickupDropChance: number;
  private readonly random: () => number;
  private readonly upgrades: ReadonlySet<UpgradeId>;
  private secondaryWasHeld = false;
  private overdriveHitCount = 0;
  private overdriveTimeRemaining = 0;
  private reflexTimeRemaining = 0;
  private reflexCooldownRemaining = 0;
  private readonly waveResolvedTimes = new Map<number, number>();

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
      upgrades?: readonly UpgradeId[];
      homingMissiles?: number;
      heldPickup?: TimedPickupId | null;
    } = {},
  ) {
    this.upgrades = new Set(options.upgrades ?? []);
    const maxShield = 5 + Number(this.upgrades.has("reinforced-shield"));
    this.player = {
      offsetX: 0,
      offsetY: 4,
      velocityX: 0,
      velocityY: 0,
      shield: Math.min(maxShield, options.shield ?? maxShield),
      maxShield,
      overshield: 0,
      overshieldTimeRemaining: 0,
      rapidFireTimeRemaining: 0,
      overchargedBoltsTimeRemaining: 0,
      spreadShotTimeRemaining: 0,
      homingMissiles: Math.min(
        PICKUP_EFFECTS.maxHomingMissiles,
        options.homingMissiles ?? STARTING_MISSILES,
      ),
      heldPickup: options.heldPickup ?? null,
      missileLockTargetIds: [],
      missileLockProgress: 0,
      chainLightningTimeRemaining: 0,
      rollDirection: 0,
      rollProgress: 0,
      rollCooldownRemaining: 0,
    };
    this.score = options.score ?? 0;
    this.level = options.level ?? 1;
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

  get aimSolution() {
    const magnetic = this.upgrades.has("magnetic-bolts");
    return this.findAimSolution(
      magnetic ? MAGNETIC_AIM_ASSIST_CONE : AIM_ASSIST_CONE,
      magnetic ? MAGNETIC_AIM_ASSIST_MAX_CORRECTION : AIM_ASSIST_MAX_CORRECTION,
    );
  }

  get missileLockLimit() {
    return (
      BASE_MISSILE_LOCKS +
      Number(this.upgrades.has("extra-lock")) -
      Number(this.upgrades.has("heavy-warheads"))
    );
  }

  get activePickup():
    { pickupId: TimedPickupId; timeRemaining: number } | undefined {
    if (this.player.overshieldTimeRemaining > 0)
      return {
        pickupId: "overshield",
        timeRemaining: this.player.overshieldTimeRemaining,
      };
    if (this.player.rapidFireTimeRemaining > 0)
      return {
        pickupId: "rapid-fire",
        timeRemaining: this.player.rapidFireTimeRemaining,
      };
    if (this.player.overchargedBoltsTimeRemaining > 0)
      return {
        pickupId: "overcharged-bolts",
        timeRemaining: this.player.overchargedBoltsTimeRemaining,
      };
    if (this.player.spreadShotTimeRemaining > 0)
      return {
        pickupId: "spread-shot",
        timeRemaining: this.player.spreadShotTimeRemaining,
      };
    if (this.player.chainLightningTimeRemaining > 0)
      return {
        pickupId: "chain-lightning",
        timeRemaining: this.player.chainLightningTimeRemaining,
      };
    return undefined;
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
    if (command.activatePickup) this.activateHeldPickup();
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.player.rollCooldownRemaining = Math.max(
      0,
      this.player.rollCooldownRemaining - dt,
    );
    this.overdriveTimeRemaining = Math.max(0, this.overdriveTimeRemaining - dt);
    this.reflexTimeRemaining = Math.max(0, this.reflexTimeRemaining - dt);
    this.reflexCooldownRemaining = Math.max(
      0,
      this.reflexCooldownRemaining - dt,
    );
    this.streamCombat();
    this.world.step(this.railDistance);

    if (
      this.rollTimeRemaining === 0 &&
      this.player.rollCooldownRemaining === 0 &&
      (command.roll ?? 0) !== 0
    ) {
      this.player.rollDirection = Math.sign(command.roll ?? 0);
      this.player.rollProgress = 0;
      this.rollTimeRemaining = this.rollDuration;
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
        1 - this.rollTimeRemaining / this.rollDuration,
      );
      if (this.rollTimeRemaining === 0)
        this.player.rollCooldownRemaining = this.rollCooldown;
    }

    const playerWorld = railOffsetPosition(
      this.railDistance,
      this.player.offsetX,
      this.player.offsetY,
    );
    this.updatePickups(playerWorld, dt);
    if (
      isRolling &&
      this.upgrades.has("reflex-core") &&
      this.reflexCooldownRemaining === 0 &&
      this.projectiles.some(
        (shot) =>
          shot.owner === "enemy" &&
          distanceSquared(shot.position, playerWorld) <=
            REFLEX_TRIGGER_DISTANCE ** 2,
      )
    ) {
      this.reflexTimeRemaining = REFLEX_CORE_DURATION;
      this.reflexCooldownRemaining = REFLEX_CORE_COOLDOWN;
    }

    if (command.fire && this.fireCooldown === 0) {
      const rail = railFrameAtDistance(this.railDistance);
      const position = railOffsetPosition(
        this.railDistance + 2,
        this.player.offsetX,
        this.player.offsetY,
      );
      const overcharged = this.player.overchargedBoltsTimeRemaining > 0;
      const aim = this.aimSolution;
      const baseDirection = aim?.assistedDirection ?? rail.forward;
      const spreadShot = this.player.spreadShotTimeRemaining > 0;
      const twinBolts = this.upgrades.has("twin-bolts") && !spreadShot;
      const shotAngles = spreadShot
        ? [-SPREAD_ANGLE, 0, SPREAD_ANGLE]
        : twinBolts
          ? [-TWIN_BOLT_ANGLE, TWIN_BOLT_ANGLE]
          : [0];
      for (const angle of shotAngles) {
        const direction = normalize({
          x: baseDirection.x * Math.cos(angle) + rail.right.x * Math.sin(angle),
          y: baseDirection.y * Math.cos(angle),
          z: baseDirection.z * Math.cos(angle) + rail.right.z * Math.sin(angle),
        });
        const baseDamage = spreadShot
          ? PICKUP_EFFECTS.spreadShotDamage
          : twinBolts
            ? TWIN_BOLT_DAMAGE
            : PLAYER_SHOT_DAMAGE;
        const damage =
          baseDamage *
          (overcharged
            ? PICKUP_EFFECTS.overchargedBoltDamageMultiplier
            : aim?.precision
              ? PRECISION_DAMAGE_MULTIPLIER
              : 1);
        this.projectiles.push({
          id: this.nextId++,
          position: { ...position },
          velocity: {
            x: direction.x * SHOT_SPEED,
            y: direction.y * SHOT_SPEED,
            z: direction.z * SHOT_SPEED,
          },
          radius: overcharged ? OVERCHARGED_SHOT_RADIUS : 0.3,
          owner: "player",
          damage,
          kind: "bolt",
          overcharged,
          precision: aim?.precision ?? false,
        });
      }
      this.fireCooldown = this.primaryFireInterval;
      result.shotsFired += shotAngles.length;
      this.events?.emit({ type: "player-fired" });
    }
    result.shotsFired += this.updateMissileLocks(
      command.secondary ?? false,
      dt,
    );

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

    if (this.upgrades.has("overdrive-core"))
      for (const { shot } of directHits)
        if (shot.kind === "bolt" && shot.owner === "player") {
          this.overdriveHitCount++;
          if (this.overdriveHitCount < OVERDRIVE_HITS) continue;
          this.overdriveHitCount -= OVERDRIVE_HITS;
          this.overdriveTimeRemaining = OVERDRIVE_DURATION;
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
          this.tryDropPickup(enemy.position, enemy.guaranteedDrop);
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
    result.scoreDelta =
      this.enemies
        .filter((enemy) => killedEnemies.has(enemy.id))
        .reduce((total, enemy) => total + ENEMIES[enemy.enemyId].score, 0) +
      directHits.filter(({ shot }) => shot.precision).length * 25;
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
    for (let index = 0; index < this.spawnedWaves; index++)
      if (!this.waveResolvedTimes.has(index) && this.isWaveResolved(index))
        this.waveResolvedTimes.set(index, this.elapsed);
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
      if (!this.canCollectPickup(pickup.pickupId)) continue;
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

  private canCollectPickup(pickupId: PickupId) {
    if (pickupId === "shield")
      return this.player.shield < this.player.maxShield;
    if (pickupId === "homing-missiles")
      return this.player.homingMissiles < PICKUP_EFFECTS.maxHomingMissiles;
    return !isTimedPickup(pickupId) || this.player.heldPickup === null;
  }

  private collectPickup(pickupId: PickupId) {
    if (isTimedPickup(pickupId)) {
      this.player.heldPickup = pickupId;
      return;
    }
    switch (pickupId) {
      case "shield":
        this.player.shield = Math.min(
          this.player.maxShield,
          this.player.shield + PICKUP_EFFECTS.shieldRestore,
        );
        break;
      case "homing-missiles":
        this.player.homingMissiles = Math.min(
          PICKUP_EFFECTS.maxHomingMissiles,
          this.player.homingMissiles + PICKUP_EFFECTS.homingMissileAmmo,
        );
        break;
    }
  }

  private activateHeldPickup() {
    const pickupId = this.player.heldPickup;
    if (!pickupId || this.activePickup) return;
    this.player.heldPickup = null;
    switch (pickupId) {
      case "overshield":
        this.player.overshield = PICKUP_EFFECTS.overshieldAmount;
        this.player.overshieldTimeRemaining = PICKUP_EFFECTS.timedDuration;
        break;
      case "rapid-fire":
        this.player.rapidFireTimeRemaining = PICKUP_EFFECTS.timedDuration;
        break;
      case "overcharged-bolts":
        this.player.overchargedBoltsTimeRemaining =
          PICKUP_EFFECTS.timedDuration;
        break;
      case "spread-shot":
        this.player.spreadShotTimeRemaining = PICKUP_EFFECTS.timedDuration;
        break;
      case "chain-lightning":
        this.player.chainLightningTimeRemaining = PICKUP_EFFECTS.timedDuration;
        break;
    }
  }

  private tryDropPickup(position: Vec3, guaranteed?: PickupId) {
    if (guaranteed) {
      this.spawnPickup(guaranteed, position);
      return;
    }
    if (this.random() >= this.pickupDropChance) return;
    if (this.player.shield <= 2) {
      this.spawnPickup("shield", position);
      return;
    }
    const index = Math.min(
      TACTICAL_PICKUP_IDS.length - 1,
      Math.floor(this.random() * TACTICAL_PICKUP_IDS.length),
    );
    this.spawnPickup(TACTICAL_PICKUP_IDS[index], position);
  }

  private findAimSolution(cone: number, maxCorrection: number) {
    const rail = railFrameAtDistance(this.railDistance);
    const origin = railOffsetPosition(
      this.railDistance + 2,
      this.player.offsetX,
      this.player.offsetY,
    );
    let best:
      | {
          enemyId: number;
          targetPosition: Vec3;
          angle: number;
          precision: boolean;
          assistedDirection: Vec3;
        }
      | undefined;
    for (const enemy of this.enemies) {
      if (enemy.scatterVelocity) continue;
      const definition = ENEMIES[enemy.enemyId];
      const distance = Math.sqrt(distanceSquared(origin, enemy.position));
      if (distance > Math.max(130, definition.shot.range)) continue;
      const enemyRail = railFrameAtDistance(enemy.railDistance);
      const leadTime = Math.min(0.85, distance / SHOT_SPEED);
      const targetPosition = {
        x:
          enemy.position.x +
          (enemyRail.forward.x * definition.forwardSpeed +
            enemyRail.right.x * (enemy.controllerState?.desiredX ?? 0)) *
            leadTime,
        y: enemy.position.y + (enemy.controllerState?.desiredY ?? 0) * leadTime,
        z:
          enemy.position.z +
          (enemyRail.forward.z * definition.forwardSpeed +
            enemyRail.right.z * (enemy.controllerState?.desiredX ?? 0)) *
            leadTime,
      };
      const direction = normalize(subtract(targetPosition, origin));
      const angle = Math.acos(clamp(dot(direction, rail.forward), -1, 1));
      if (angle > cone || (best && angle >= best.angle)) continue;
      const blend = angle === 0 ? 1 : Math.min(1, maxCorrection / angle);
      best = {
        enemyId: enemy.id,
        targetPosition,
        angle,
        precision: angle <= PRECISION_CONE,
        assistedDirection: normalize({
          x: rail.forward.x + (direction.x - rail.forward.x) * blend,
          y: rail.forward.y + (direction.y - rail.forward.y) * blend,
          z: rail.forward.z + (direction.z - rail.forward.z) * blend,
        }),
      };
    }
    return best;
  }

  private findMissileLockCandidate(excluded: ReadonlySet<number>) {
    const rail = railFrameAtDistance(this.railDistance);
    const origin = railOffsetPosition(
      this.railDistance + 2,
      this.player.offsetX,
      this.player.offsetY,
    );
    let best: { enemy: EnemyState; angle: number } | undefined;
    for (const enemy of this.enemies) {
      if (
        enemy.scatterVelocity ||
        (enemy.kind !== "boss" && excluded.has(enemy.id))
      )
        continue;
      const offset = subtract(enemy.position, origin);
      const distance = Math.sqrt(dot(offset, offset));
      if (distance > MISSILE_LOCK_RANGE) continue;
      const direction = normalize(offset);
      const angle = Math.acos(clamp(dot(direction, rail.forward), -1, 1));
      if (angle <= MISSILE_LOCK_CONE && (!best || angle < best.angle))
        best = { enemy, angle };
    }
    return best?.enemy;
  }

  private updateMissileLocks(held: boolean, dt: number) {
    this.player.missileLockTargetIds = this.player.missileLockTargetIds.filter(
      (id) => this.enemies.some((enemy) => enemy.id === id),
    );
    let fired = 0;
    if (held && this.player.homingMissiles > 0) {
      const limit = Math.min(this.missileLockLimit, this.player.homingMissiles);
      if (this.player.missileLockTargetIds.length < limit) {
        const interval =
          MISSILE_LOCK_INTERVAL * (this.upgrades.has("faster-lock") ? 0.65 : 1);
        this.player.missileLockProgress += dt;
        while (
          this.player.missileLockProgress >= interval &&
          this.player.missileLockTargetIds.length < limit
        ) {
          const candidate = this.findMissileLockCandidate(
            new Set(this.player.missileLockTargetIds),
          );
          if (!candidate) {
            this.player.missileLockProgress = Math.min(
              this.player.missileLockProgress,
              interval,
            );
            break;
          }
          this.player.missileLockTargetIds.push(candidate.id);
          this.player.missileLockProgress -= interval;
        }
      }
    } else if (!held && this.secondaryWasHeld) {
      const position = railOffsetPosition(
        this.railDistance + 2,
        this.player.offsetX,
        this.player.offsetY,
      );
      for (const targetId of this.player.missileLockTargetIds) {
        if (this.player.homingMissiles <= 0) break;
        const target = this.enemies.find((enemy) => enemy.id === targetId);
        if (!target) continue;
        const direction = normalize(subtract(target.position, position));
        this.projectiles.push({
          id: this.nextId++,
          position: { ...position },
          velocity: {
            x: direction.x * HOMING_MISSILE_SPEED,
            y: direction.y * HOMING_MISSILE_SPEED,
            z: direction.z * HOMING_MISSILE_SPEED,
          },
          radius: HOMING_MISSILE_RADIUS,
          owner: "player",
          damage:
            HOMING_MISSILE_DAMAGE *
            (this.upgrades.has("heavy-warheads") ? 1.5 : 1),
          kind: "homing-missile",
          targetEnemyId: targetId,
          retargetsRemaining: this.upgrades.has("salvo-protocol") ? 1 : 0,
        });
        this.player.homingMissiles--;
        fired++;
      }
      this.player.missileLockTargetIds = [];
      this.player.missileLockProgress = 0;
      if (fired > 0) this.events?.emit({ type: "player-fired" });
    } else if (!held) this.player.missileLockProgress = 0;
    this.secondaryWasHeld = held;
    return fired;
  }

  private updateHomingProjectiles(dt: number) {
    for (const shot of this.projectiles) {
      if (shot.kind !== "homing-missile" || shot.owner !== "player") continue;
      let target = shot.targetEnemyId
        ? this.enemies.find((enemy) => enemy.id === shot.targetEnemyId)
        : undefined;
      let nearestDistanceSquared = SALVO_RETARGET_RANGE ** 2;
      if (!target && (shot.retargetsRemaining ?? 0) > 0)
        for (const enemy of this.enemies) {
          const candidateDistanceSquared = distanceSquared(
            shot.position,
            enemy.position,
          );
          if (candidateDistanceSquared >= nearestDistanceSquared) continue;
          target = enemy;
          nearestDistanceSquared = candidateDistanceSquared;
        }
      if (target && target.id !== shot.targetEnemyId) {
        shot.targetEnemyId = target.id;
        shot.retargetsRemaining = Math.max(
          0,
          (shot.retargetsRemaining ?? 0) - 1,
        );
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
      const steeringRate =
        HOMING_STEERING_RATE *
        (this.upgrades.has("salvo-protocol") ? SALVO_STEERING_MULTIPLIER : 1);
      const blend = Math.min(1, steeringRate * dt);
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

  private get rollDuration() {
    return this.upgrades.has("phase-roll")
      ? PHASE_ROLL_DURATION
      : BARREL_ROLL_DURATION;
  }

  private get rollCooldown() {
    return this.upgrades.has("reflex-actuators")
      ? REFLEX_ACTUATOR_COOLDOWN
      : BARREL_ROLL_COOLDOWN;
  }

  private get primaryFireInterval() {
    const calibratedMultiplier = this.upgrades.has("calibrated-emitters")
      ? CALIBRATED_FIRE_MULTIPLIER
      : 1;
    const temporaryMultiplier =
      this.player.rapidFireTimeRemaining > 0
        ? PICKUP_EFFECTS.rapidFireIntervalMultiplier
        : this.overdriveTimeRemaining > 0 || this.reflexTimeRemaining > 0
          ? UPGRADE_FIRE_MULTIPLIER
          : 1;
    return FIRE_INTERVAL * calibratedMultiplier * temporaryMultiplier;
  }

  private streamCombat() {
    while (this.spawnedWaves < this.enemyPlan.waves.length) {
      const wave = this.enemyPlan.waves[this.spawnedWaves];
      if (this.railDistance < wave.spawnAtRailDistance) break;
      if (wave.requiresPreviousWaveResolved) {
        const previousWave = this.spawnedWaves - 1;
        if (!this.isWaveResolved(previousWave)) break;
        const resolvedAt =
          this.waveResolvedTimes.get(previousWave) ?? this.elapsed;
        this.waveResolvedTimes.set(previousWave, resolvedAt);
        if (this.elapsed < resolvedAt + (wave.spawnDelaySeconds ?? 0)) break;
      }
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
        (wave.enemyDistanceAhead === undefined
          ? wave.enemyRailDistance
          : this.railDistance + wave.enemyDistanceAhead) -
        index * (group.railSpacing ?? 2);
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
        health: this.oneShotEnemies ? 1 : definition.baseHealth,
        maxHealth: this.oneShotEnemies ? 1 : definition.baseHealth,
        exitRailDistance: wave.exitAtRailDistance,
        exitAtElapsed:
          wave.durationSeconds === undefined
            ? undefined
            : this.elapsed + wave.durationSeconds,
        guaranteedDrop:
          index === group.formation.length - 1
            ? group.guaranteedDrop
            : undefined,
        attackState: {
          cooldown: definition.shot.interval * (0.4 + (index % 4) * 0.18),
          telegraphRemaining: 0,
          telegraphDuration: definition.shot.telegraph,
          patternStep: index,
        },
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
        ((enemy.exitRailDistance !== undefined &&
          this.railDistance >= enemy.exitRailDistance) ||
          (enemy.exitAtElapsed !== undefined &&
            this.elapsed >= enemy.exitAtElapsed))
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
    }
    this.updateEnemyAttacks(playerPosition, context.playerVelocity, dt);
  }

  private updateEnemyAttacks(
    playerPosition: Vec3,
    playerVelocity: Vec3,
    dt: number,
  ) {
    for (const enemy of this.enemies) {
      enemy.attackTelegraph = 0;
      if (enemy.scatterVelocity) continue;
      const definition = ENEMIES[enemy.enemyId];
      const state = (enemy.attackState ??= {
        cooldown: 0,
        telegraphRemaining: 0,
        telegraphDuration: definition.shot.telegraph,
        patternStep: enemy.id,
      });
      state.cooldown = Math.max(0, state.cooldown - dt);
      if (state.telegraphRemaining <= 0) continue;
      state.telegraphRemaining = Math.max(0, state.telegraphRemaining - dt);
      enemy.attackTelegraph =
        1 - state.telegraphRemaining / state.telegraphDuration;
      if (state.telegraphRemaining > 0) continue;
      this.fireEnemyPattern(enemy, playerPosition, playerVelocity);
      state.patternStep++;
      state.cooldown =
        definition.shot.interval * (0.92 + (enemy.id % 4) * 0.07);
    }

    const activeTelegraphs = this.enemies.filter(
      (enemy) => (enemy.attackState?.telegraphRemaining ?? 0) > 0,
    ).length;
    let availableShooters = this.activeShooterLimit() - activeTelegraphs;
    if (
      availableShooters <= 0 ||
      this.hostileProjectileCount() >= this.hostileProjectileBudget()
    )
      return;
    const candidates = this.enemies
      .filter((enemy) => {
        if (
          enemy.scatterVelocity ||
          (enemy.attackState?.cooldown ?? 0) > 0 ||
          (enemy.attackState?.telegraphRemaining ?? 0) > 0
        )
          return false;
        const definition = ENEMIES[enemy.enemyId];
        return (
          distanceSquared(enemy.position, playerPosition) <
          definition.shot.range ** 2
        );
      })
      .sort(
        (left, right) =>
          ((left.id + Math.floor(this.elapsed / 2.5)) % 11) -
          ((right.id + Math.floor(this.elapsed / 2.5)) % 11),
      );
    for (const enemy of candidates) {
      if (availableShooters <= 0) break;
      const state = enemy.attackState!;
      state.telegraphDuration = ENEMIES[enemy.enemyId].shot.telegraph;
      state.telegraphRemaining = state.telegraphDuration;
      enemy.attackTelegraph = 0.01;
      availableShooters--;
    }
  }

  private activeShooterLimit() {
    return this.level <= 2 ? 2 : 3;
  }

  private hostileProjectileBudget() {
    return Math.min(18, 12 + Math.max(0, this.level - 1));
  }

  private hostileProjectileCount() {
    return this.projectiles.filter((shot) => shot.owner === "enemy").length;
  }

  private fireEnemyPattern(
    enemy: EnemyState,
    playerPosition: Vec3,
    playerVelocity: Vec3,
  ) {
    const definition = ENEMIES[enemy.enemyId];
    let pattern = definition.shot.pattern;
    if (pattern === "boss") {
      const healthPhase = Math.floor(
        (1 - (enemy.health ?? 1) / (enemy.maxHealth ?? 1)) * 3,
      );
      const patterns = [
        "aimed-burst",
        "fan-gap",
        "sweep",
        "heavy-darts",
      ] as const;
      pattern = patterns[(this.level + healthPhase) % patterns.length];
    }
    const step = enemy.attackState?.patternStep ?? 0;
    switch (pattern) {
      case "aimed-burst":
        this.fireEnemyShot(enemy, playerPosition, playerVelocity, {
          spreads: [-0.045, 0, 0.045],
        });
        break;
      case "fan-gap":
        this.fireEnemyShot(enemy, playerPosition, playerVelocity, {
          spreads: [-0.18, -0.09, 0.09, 0.18],
          speedMultiplier: 0.82,
        });
        break;
      case "sweep":
        this.fireEnemyShot(enemy, playerPosition, playerVelocity, {
          spreads: step % 2 === 0 ? [-0.13, -0.045] : [0.045, 0.13],
          targetYOffset: step % 2 === 0 ? 2.8 : -2.8,
        });
        break;
      case "heavy-darts":
        this.fireEnemyShot(enemy, playerPosition, playerVelocity, {
          spreads: [0],
          speedMultiplier: 0.72,
          damageMultiplier: 1.2,
          radiusMultiplier: 1.35,
        });
        this.fireEnemyShot(enemy, playerPosition, playerVelocity, {
          spreads: [-0.08, 0.08],
          speedMultiplier: 1.18,
          damageMultiplier: 0.55,
        });
        break;
    }
  }

  private fireEnemyShot(
    enemy: EnemyState,
    playerPosition: Vec3,
    playerVelocity: Vec3,
    options: {
      spreads: readonly number[];
      targetYOffset?: number;
      speedMultiplier?: number;
      damageMultiplier?: number;
      radiusMultiplier?: number;
    },
  ) {
    const distance = Math.sqrt(distanceSquared(enemy.position, playerPosition));
    const definition = ENEMIES[enemy.enemyId];
    const shotSpeed = definition.shot.speed * (options.speedMultiplier ?? 1);
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
        error * 0.35 +
        (options.targetYOffset ?? 0),
      z: playerPosition.z + playerVelocity.z * leadTime * definition.shot.lead,
    };
    if (this.world.lineOfFireBlocked(enemy.position, target)) return;
    const dx = target.x - enemy.position.x,
      dy = target.y - enemy.position.y,
      dz = target.z - enemy.position.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    for (const spread of options.spreads) {
      if (this.hostileProjectileCount() >= this.hostileProjectileBudget())
        break;
      this.projectiles.push({
        id: this.nextId++,
        position: { ...enemy.position },
        velocity: {
          x: (dx / length) * shotSpeed + spread * shotSpeed,
          y: (dy / length) * shotSpeed,
          z: (dz / length) * shotSpeed - spread * shotSpeed * 0.3,
        },
        radius: definition.shot.radius * (options.radiusMultiplier ?? 1),
        owner: "enemy",
        damage: definition.shot.damage * (options.damageMultiplier ?? 1),
      });
    }
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
function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(value.x, value.y, value.z) || 1;
  return {
    x: value.x / length,
    y: value.y / length,
    z: value.z / length,
  };
}
