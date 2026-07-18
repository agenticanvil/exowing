import type { EnemyControllerId, EnemyId, EnemyKind } from "../enemies";
import type { PickupId } from "../pickups";

export type { EnemyControllerId } from "../enemies";

export type Vec3 = { x: number; y: number; z: number };

export type PlayerCommand = {
  steerX: number;
  steerY: number;
  fire: boolean;
  pace: number;
  roll?: number;
};

export type PlayerState = {
  offsetX: number;
  offsetY: number;
  velocityX: number;
  velocityY: number;
  shield: number;
  overshield: number;
  overshieldTimeRemaining: number;
  rapidFireTimeRemaining: number;
  overchargedBoltsTimeRemaining: number;
  spreadShotTimeRemaining: number;
  homingMissiles: number;
  chainLightningTimeRemaining: number;
  rollDirection: number;
  rollProgress: number;
};

export type EnemyControllerState = {
  decisionCooldown: number;
  fireCooldown: number;
  desiredX: number;
  desiredY: number;
  desiredDepthSpeed: number;
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
  scatterVelocity?: Vec3;
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
  overcharged?: boolean;
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
