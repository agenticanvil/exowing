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
  rollDirection: number;
  rollProgress: number;
};

export type EnemyControllerId = "standard" | "formation" | "boss";
export type EnemyControllerState = {
  decisionCooldown: number;
  fireCooldown: number;
  desiredX: number;
  desiredY: number;
  desiredDepthSpeed: number;
};

export type EnemyState = {
  id: number;
  position: Vec3;
  radius: number;
  railDistance: number;
  offsetX: number;
  offsetY: number;
  phase: number;
  sectionIndex: number;
  kind?: "standard" | "boss";
  health?: number;
  maxHealth?: number;
  hitFlash?: number;
  exitRailDistance?: number;
  controller?: EnemyControllerId;
  controllerState?: EnemyControllerState;
  scatterVelocity?: Vec3;
};
export type ProjectileState = {
  id: number;
  position: Vec3;
  velocity: Vec3;
  radius: number;
  owner: "player" | "enemy";
  damage?: number;
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
};
