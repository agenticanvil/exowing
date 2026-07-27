import type { EnemyControllerId, EnemyId, EnemyKind } from "../enemies";
import type { PickupId, TimedPickupId } from "../pickups";
import type { UpgradeId } from "../upgrades";

export type { EnemyControllerId } from "../enemies";

export type Vec3 = { x: number; y: number; z: number };

export type PlayerCommand = {
  steerX: number;
  steerY: number;
  fire: boolean;
  secondary?: boolean;
  activatePickup?: boolean;
  pace: number;
  roll?: number;
};

export type PlayerState = {
  offsetX: number;
  offsetY: number;
  velocityX: number;
  velocityY: number;
  shield: number;
  maxShield: number;
  overshield: number;
  overshieldTimeRemaining: number;
  rapidFireTimeRemaining: number;
  overchargedBoltsTimeRemaining: number;
  spreadShotTimeRemaining: number;
  homingMissiles: number;
  heldPickup: TimedPickupId | null;
  missileLockTargetIds: number[];
  missileLockProgress: number;
  chainLightningTimeRemaining: number;
  rollDirection: number;
  rollProgress: number;
  rollCooldownRemaining: number;
};

export type EnemyControllerState = {
  decisionCooldown: number;
  dodgeCooldown?: number;
  /** Legacy field retained for deterministic fixture compatibility. */
  fireCooldown?: number;
  desiredX: number;
  desiredY: number;
  desiredDepthSpeed: number;
};
export type EnemyAttackState = {
  cooldown: number;
  telegraphRemaining: number;
  telegraphDuration: number;
  patternStep: number;
};

export type EnemyState = {
  id: number;
  enemyId: EnemyId;
  position: Vec3;
  radius: number;
  railDistance: number;
  offsetX: number;
  offsetY: number;
  phase: number;
  waveIndex: number;
  kind?: EnemyKind;
  health?: number;
  maxHealth?: number;
  hitFlash?: number;
  exitRailDistance?: number;
  controller?: EnemyControllerId;
  controllerState?: EnemyControllerState;
  attackState?: EnemyAttackState;
  attackTelegraph?: number;
  scatterVelocity?: Vec3;
  exitAtElapsed?: number;
  guaranteedDrop?: PickupId;
};
export type EnemyDestructionState = {
  id: number;
  enemyId: EnemyId;
  position: Vec3;
  radius: number;
  kind: EnemyKind;
  age: number;
  duration: number;
};
export type ProjectileState = {
  id: number;
  position: Vec3;
  velocity: Vec3;
  radius: number;
  owner: "player" | "enemy";
  damage?: number;
  kind?: "bolt" | "homing-missile";
  targetEnemyId?: number;
  retargetsRemaining?: number;
  overcharged?: boolean;
  precision?: boolean;
};
export type PickupState = {
  id: number;
  pickupId: PickupId;
  position: Vec3;
  age: number;
};
export type ChainLightningState = {
  id: number;
  points: Vec3[];
  age: number;
  duration: number;
};
export type IslandState = {
  id: number;
  position: Vec3;
  size: Vec3;
  rotation: number;
  railDistance: number;
};

export type FlightStepResult = {
  shotsFired: number;
  enemyHits: number;
  kills: number;
  scoreDelta: number;
  playerHits: number;
  bossDefeated: boolean;
  levelComplete: boolean;
};

export type CampaignCarry = {
  shield: number;
  score: number;
  homingMissiles: number;
  heldPickup: TimedPickupId | null;
  upgrades: UpgradeId[];
};
