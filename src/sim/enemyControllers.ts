import type {
  EnemyControllerId,
  EnemyControllerState,
  EnemyState,
  ProjectileState,
  Vec3,
} from "./types";
import { ENEMIES } from "../enemies";
import { railFrameAtDistance } from "./railSystem";

const MAX_X = 14;
const MIN_Y = 0.8;
const MAX_Y = 13;
const BOSS_CLOSE_DISTANCE = 36;
const BOSS_MAX_HORIZONTAL_SPEED = 11;
const BOSS_MAX_VERTICAL_SPEED = 8;
const REINFORCEMENT_INTENSITY = 1.12;

export type EnemyControlContext = {
  elapsed: number;
  playerPosition: Vec3;
  playerVelocity: Vec3;
  playerRailDistance: number;
  playerShots: readonly ProjectileState[];
  enemies: readonly EnemyState[];
};

export type EnemyControl = {
  offsetVelocityX: number;
  offsetVelocityY: number;
  depthSpeed: number;
  fire: boolean;
};

const controllers: Record<
  EnemyControllerId,
  (
    enemy: EnemyState,
    state: EnemyControllerState,
    context: EnemyControlContext,
    dt: number,
  ) => EnemyControl
> = {
  standard: controlStandardEnemy,
  formation: () => ({
    offsetVelocityX: 0,
    offsetVelocityY: 0,
    depthSpeed: 0,
    fire: false,
  }),
  boss: controlBoss,
};

export function controlEnemy(
  enemy: EnemyState,
  context: EnemyControlContext,
  dt: number,
): EnemyControl {
  const controller = enemy.controller ?? "standard";
  const state = (enemy.controllerState ??= {
    decisionCooldown: (enemy.id % 7) * 0.04,
    dodgeCooldown: 0,
    desiredX: 0,
    desiredY: 0,
    desiredDepthSpeed: 0,
  });
  return controllers[controller](enemy, state, context, dt);
}

function controlBoss(
  enemy: EnemyState,
  state: EnemyControllerState,
  context: EnemyControlContext,
  dt: number,
): EnemyControl {
  const distanceAhead = enemy.railDistance - context.playerRailDistance;
  const close = distanceAhead < BOSS_CLOSE_DISTANCE;
  state.decisionCooldown -= dt;
  if (state.decisionCooldown <= 0) {
    const decisionSeed = enemy.id * 0.73 + context.elapsed * 3.17;
    state.decisionCooldown = close
      ? 0.12 + Math.abs(signedNoise(decisionSeed)) * 0.16
      : 0.38 + Math.abs(signedNoise(decisionSeed)) * 0.42;
    state.desiredX = signedNoise(decisionSeed + 11.3) * (close ? 10 : 5.5);
    state.desiredY = signedNoise(decisionSeed + 29.7) * (close ? 6.5 : 3.5);
    state.desiredDepthSpeed = close
      ? 14 + (signedNoise(decisionSeed + 47.1) + 1) * 7
      : signedNoise(decisionSeed + 47.1) * 4.5;
  }
  const edgeX =
    enemy.offsetX < -MAX_X + 3 ? 7 : enemy.offsetX > MAX_X - 3 ? -7 : 0;
  const edgeY =
    enemy.offsetY < MIN_Y + 2 ? 6 : enemy.offsetY > MAX_Y - 2 ? -6 : 0;
  return {
    offsetVelocityX: clamp(
      state.desiredX + edgeX,
      -BOSS_MAX_HORIZONTAL_SPEED,
      BOSS_MAX_HORIZONTAL_SPEED,
    ),
    offsetVelocityY: clamp(
      state.desiredY + edgeY,
      -BOSS_MAX_VERTICAL_SPEED,
      BOSS_MAX_VERTICAL_SPEED,
    ),
    depthSpeed: state.desiredDepthSpeed,
    fire: false,
  };
}

function controlStandardEnemy(
  enemy: EnemyState,
  state: EnemyControllerState,
  context: EnemyControlContext,
  dt: number,
): EnemyControl {
  const definition = ENEMIES[enemy.enemyId];
  const movement = definition.movement;
  if (!movement)
    throw new Error(`${definition.label} has no standard movement profile.`);
  const intensity = enemy.waveIndex === 1 ? REINFORCEMENT_INTENSITY : 1;
  state.decisionCooldown -= dt;
  state.dodgeCooldown = Math.max(0, (state.dodgeCooldown ?? 0) - dt);
  if (state.decisionCooldown <= 0) {
    state.decisionCooldown =
      (movement.decisionInterval * (0.9 + (enemy.id % 4) * 0.07)) / intensity;
    const rail = railFrameAtDistance(enemy.railDistance);
    let avoidX = 0;
    let avoidY = 0;

    if (state.dodgeCooldown === 0 && movement.role !== "artillery") {
      for (const shot of context.playerShots) {
        const relative = subtract(enemy.position, shot.position);
        const speedSquared = dot(shot.velocity, shot.velocity);
        const time =
          speedSquared > 0 ? dot(relative, shot.velocity) / speedSquared : -1;
        if (time <= 0 || time > 0.7) continue;
        const closest = subtract(relative, scale(shot.velocity, time));
        const lateral = dot(closest, rail.right);
        const vertical = closest.y;
        if (lateral * lateral + vertical * vertical < 12) {
          const bias =
            ((enemy.id + Math.floor(context.elapsed * 2)) & 1) === 0 ? -1 : 1;
          avoidX +=
            (Math.abs(lateral) > 0.15 ? Math.sign(lateral) * 4 : bias * 4) *
            movement.dodgeStrength;
          avoidY +=
            (Math.abs(vertical) > 0.15 ? Math.sign(vertical) * 2.5 : bias * 2) *
            movement.dodgeStrength;
          state.dodgeCooldown = 1.5 + (enemy.id % 5) * 0.22;
          break;
        }
      }
    }

    for (const other of context.enemies) {
      if (other === enemy || other.scatterVelocity) continue;
      const dx = enemy.offsetX - other.offsetX;
      const dy = enemy.offsetY - other.offsetY;
      const dz = enemy.railDistance - other.railDistance;
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      if (distanceSquared > 0.01 && distanceSquared < 25) {
        const strength = (5 - Math.sqrt(distanceSquared)) / 5;
        avoidX +=
          (dx / Math.sqrt(distanceSquared)) *
          strength *
          5 *
          movement.separationStrength;
        avoidY +=
          (dy / Math.sqrt(distanceSquared)) *
          strength *
          3 *
          movement.separationStrength;
      }
    }

    const roleMovement = movementForRole(enemy, context, movement.role);
    state.desiredX = avoidX + roleMovement.x * intensity;
    state.desiredY = avoidY + roleMovement.y * intensity;
    state.desiredDepthSpeed =
      Math.sin(context.elapsed * movement.depthFrequency + enemy.phase * 1.7) *
      movement.depthAmplitude *
      intensity;
  }

  const edgeX =
    enemy.offsetX < -MAX_X + 2 ? 5 : enemy.offsetX > MAX_X - 2 ? -5 : 0;
  const edgeY =
    enemy.offsetY < MIN_Y + 1.5 ? 4 : enemy.offsetY > MAX_Y - 1.5 ? -4 : 0;
  return {
    offsetVelocityX: clamp(
      state.desiredX + edgeX,
      -movement.maxHorizontalSpeed * intensity,
      movement.maxHorizontalSpeed * intensity,
    ),
    offsetVelocityY: clamp(
      state.desiredY + edgeY,
      -movement.maxVerticalSpeed * intensity,
      movement.maxVerticalSpeed * intensity,
    ),
    depthSpeed: state.desiredDepthSpeed,
    fire: false,
  };
}

function movementForRole(
  enemy: EnemyState,
  context: EnemyControlContext,
  role: NonNullable<
    (typeof ENEMIES)[EnemyState["enemyId"]]["movement"]
  >["role"],
) {
  const movement = ENEMIES[enemy.enemyId].movement!;
  const phase = context.elapsed + enemy.phase;
  switch (role) {
    case "strafe": {
      const sweep = Math.sin(phase * movement.horizontalFrequency);
      return {
        x:
          Math.sign(sweep || 1) *
          Math.abs(sweep) ** 0.65 *
          movement.horizontalAmplitude,
        y:
          Math.cos(phase * movement.verticalFrequency) *
          movement.verticalAmplitude,
      };
    }
    case "dive": {
      const cycle = (((phase * 0.38) % 1) + 1) % 1;
      const attacking = cycle < 0.42;
      const targetX = attacking
        ? context.playerPosition.x - enemy.position.x
        : (enemy.id % 2 === 0 ? -1 : 1) * movement.horizontalAmplitude;
      const targetY = attacking
        ? context.playerPosition.y - enemy.position.y
        : movement.verticalAmplitude;
      return {
        x: clamp(
          targetX * 1.35,
          -movement.maxHorizontalSpeed,
          movement.maxHorizontalSpeed,
        ),
        y: clamp(
          targetY * 1.15,
          -movement.maxVerticalSpeed,
          movement.maxVerticalSpeed,
        ),
      };
    }
    case "artillery": {
      const anchorX =
        ((enemy.id % 3) - 1) * Math.max(4, movement.horizontalAmplitude * 2);
      const anchorY = 4 + (enemy.id % 2) * 3;
      return {
        x: clamp(
          (anchorX - enemy.offsetX) * 0.8,
          -movement.maxHorizontalSpeed,
          movement.maxHorizontalSpeed,
        ),
        y: clamp(
          (anchorY - enemy.offsetY) * 0.65,
          -movement.maxVerticalSpeed,
          movement.maxVerticalSpeed,
        ),
      };
    }
    case "formation": {
      const direction = enemy.waveIndex % 2 === 0 ? 1 : -1;
      return {
        x:
          direction *
          Math.cos(phase * movement.horizontalFrequency) *
          movement.horizontalAmplitude,
        y:
          Math.sin(phase * movement.verticalFrequency * 0.6) *
          movement.verticalAmplitude,
      };
    }
  }
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale(a: Vec3, amount: number): Vec3 {
  return { x: a.x * amount, y: a.y * amount, z: a.z * amount };
}
function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function signedNoise(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}
