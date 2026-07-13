import type {
  EnemyControllerId,
  EnemyControllerState,
  EnemyState,
  ProjectileState,
  Vec3,
} from "./types";
import { railFrameAtDistance } from "./railSystem";

const MAX_X = 14;
const MIN_Y = 0.8;
const MAX_Y = 13;
const STANDARD_MAX_HORIZONTAL_SPEED = 7;
const STANDARD_MAX_VERTICAL_SPEED = 5;
const BOSS_CLOSE_DISTANCE = 36;
const BOSS_MAX_HORIZONTAL_SPEED = 11;
const BOSS_MAX_VERTICAL_SPEED = 8;

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
    fireCooldown: 0.8 + (enemy.id % 5) * 0.31,
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
  state.fireCooldown -= dt;
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
  const fire = state.fireCooldown <= 0;
  if (fire) state.fireCooldown = 0.62;
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
    fire,
  };
}

function controlStandardEnemy(
  enemy: EnemyState,
  state: EnemyControllerState,
  context: EnemyControlContext,
  dt: number,
): EnemyControl {
  state.decisionCooldown -= dt;
  state.fireCooldown -= dt;
  if (state.decisionCooldown <= 0) {
    state.decisionCooldown = 0.18 + (enemy.id % 4) * 0.035; // Human-sized reaction gap keeps dodges beatable.
    const rail = railFrameAtDistance(enemy.railDistance);
    let avoidX = 0;
    let avoidY = 0;

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
        avoidX += Math.abs(lateral) > 0.15 ? Math.sign(lateral) * 4 : bias * 4;
        avoidY +=
          Math.abs(vertical) > 0.15 ? Math.sign(vertical) * 2.5 : bias * 2;
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
        avoidX += (dx / Math.sqrt(distanceSquared)) * strength * 5;
        avoidY += (dy / Math.sqrt(distanceSquared)) * strength * 3;
      }
    }

    const wander = Math.sin(context.elapsed * 1.15 + enemy.phase);
    state.desiredX = avoidX + wander * 2.2;
    state.desiredY =
      avoidY + Math.cos(context.elapsed * 0.9 + enemy.phase) * 1.2;
    state.desiredDepthSpeed =
      Math.sin(context.elapsed * 0.48 + enemy.phase * 1.7) * 3.2;
  }

  const fire =
    state.fireCooldown <= 0 &&
    distanceSquared(enemy.position, context.playerPosition) < 125 * 125;
  if (fire) state.fireCooldown = 1.25 + (enemy.id % 6) * 0.17;
  const edgeX =
    enemy.offsetX < -MAX_X + 2 ? 5 : enemy.offsetX > MAX_X - 2 ? -5 : 0;
  const edgeY =
    enemy.offsetY < MIN_Y + 1.5 ? 4 : enemy.offsetY > MAX_Y - 1.5 ? -4 : 0;
  return {
    offsetVelocityX: clamp(
      state.desiredX + edgeX,
      -STANDARD_MAX_HORIZONTAL_SPEED,
      STANDARD_MAX_HORIZONTAL_SPEED,
    ),
    offsetVelocityY: clamp(
      state.desiredY + edgeY,
      -STANDARD_MAX_VERTICAL_SPEED,
      STANDARD_MAX_VERTICAL_SPEED,
    ),
    depthSpeed: state.desiredDepthSpeed,
    fire,
  };
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
function distanceSquared(a: Vec3, b: Vec3) {
  const d = subtract(a, b);
  return dot(d, d);
}
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function signedNoise(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}
