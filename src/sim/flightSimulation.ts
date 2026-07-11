import type { EnemyState, FlightStepResult, IslandState, PlayerCommand, PlayerState, ProjectileState } from './types';
import { railFrameAtDistance, railOffsetPosition, RAIL_SPEED, SECTION_LENGTH, SECTION_SPAN } from './railSystem';
import { controlEnemy } from './enemyControllers';

const PLAYER_SPEED = 12;
const SHOT_SPEED = 68;
const FIRE_INTERVAL = 0.18;
const SLOW_RAIL_SPEED = 6;
const FAST_RAIL_SPEED = 25;
const PACE_RAMP_RATE = 14;
const STREAM_AHEAD = 220;
const ISLAND_SPACING = 42;
const CLEANUP_MARGIN = 38;
const ENEMY_CLEANUP_MARGIN = 180;
const ENEMY_SCATTER_LEAD = 42;
const ENEMY_FORWARD_SPEED = 7;
const ENEMY_SHOT_SPEED = 38;
export const ENEMY_MIN_PLAYER_DISTANCE = 14;
const ENEMY_RETREAT_SPEED = 32;
export const FLIGHT_WINDOW = { maxX: 14, minY: 0.8, maxY: 13, cameraPadding: 1.8 } as const;

export class FlightSimulation {
  readonly player: PlayerState = { offsetX: 0, offsetY: 4, velocityX: 0, velocityY: 0, health: 5 };
  readonly enemies: EnemyState[] = [];
  readonly projectiles: ProjectileState[] = [];
  readonly islands: IslandState[] = [];
  railDistance = 0;
  railSpeed = RAIL_SPEED;
  score = 0;
  invulnerable = false;
  private nextId = 1;
  private fireCooldown = 0;
  private elapsed = 0;
  private nextIslandDistance = 34;
  private nextEnemySection = 0;

  constructor() {
    this.streamWorld();
  }

  step(command: PlayerCommand, dt: number): FlightStepResult {
    const result: FlightStepResult = { shotsFired: 0, enemyHits: 0, kills: 0, scoreDelta: 0, playerHits: 0 };
    const targetRailSpeed = command.pace > 0 ? FAST_RAIL_SPEED : command.pace < 0 ? SLOW_RAIL_SPEED : RAIL_SPEED;
    this.railSpeed = moveTowards(this.railSpeed, targetRailSpeed, PACE_RAMP_RATE * dt);
    this.railDistance += this.railSpeed * dt;
    this.elapsed += dt;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.streamWorld();

    this.player.velocityX = command.steerX * PLAYER_SPEED;
    this.player.velocityY = command.steerY * PLAYER_SPEED;
    this.player.offsetX = clamp(this.player.offsetX + this.player.velocityX * dt, -FLIGHT_WINDOW.maxX, FLIGHT_WINDOW.maxX);
    this.player.offsetY = clamp(this.player.offsetY + this.player.velocityY * dt, FLIGHT_WINDOW.minY, FLIGHT_WINDOW.maxY);

    if (command.fire && this.fireCooldown === 0) {
      const rail = railFrameAtDistance(this.railDistance);
      const position = railOffsetPosition(this.railDistance + 2, this.player.offsetX, this.player.offsetY);
      this.projectiles.push({ id: this.nextId++, position, velocity: { x: rail.forward.x * SHOT_SPEED, y: 0, z: rail.forward.z * SHOT_SPEED }, radius: 0.3, owner: 'player' });
      this.fireCooldown = FIRE_INTERVAL;
      result.shotsFired = 1;
    }

    for (const shot of this.projectiles) {
      shot.position.x += shot.velocity.x * dt;
      shot.position.y += shot.velocity.y * dt;
      shot.position.z += shot.velocity.z * dt;
    }
    this.updateEnemies(dt);

    const hitShots = new Set<number>();
    const hitEnemies = new Set<number>();
    for (const shot of this.projectiles) for (const enemy of this.enemies) {
      if (shot.owner !== 'player') continue;
      const radius = shot.radius + enemy.radius;
      if (distanceSquared(shot.position, enemy.position) <= radius * radius) { hitShots.add(shot.id); hitEnemies.add(enemy.id); break; }
    }

    const playerWorld = railOffsetPosition(this.railDistance, this.player.offsetX, this.player.offsetY);
    for (const shot of this.projectiles) if (shot.owner === 'enemy' && distanceSquared(shot.position, playerWorld) <= (shot.radius + 0.9) ** 2) {
      hitShots.add(shot.id);
      result.playerHits++;
    }
    if (!this.invulnerable) this.player.health = Math.max(0, this.player.health - result.playerHits);
    removeWhere(this.projectiles, (shot) => hitShots.has(shot.id) || distanceSquared(shot.position, playerWorld) > 150 * 150);
    removeWhere(this.enemies, (enemy) => hitEnemies.has(enemy.id) || enemy.railDistance < this.railDistance - ENEMY_CLEANUP_MARGIN || distanceSquared(enemy.position, playerWorld) > 260 * 260);
    removeWhere(this.islands, (island) => island.railDistance < this.railDistance - CLEANUP_MARGIN);
    result.enemyHits = hitEnemies.size;
    result.kills = hitEnemies.size;
    result.scoreDelta = hitEnemies.size * 100;
    this.score += result.scoreDelta;
    return result;
  }

  private streamWorld() {
    while (this.nextIslandDistance <= this.railDistance + STREAM_AHEAD) {
      const seed = hash(this.nextIslandDistance / ISLAND_SPACING);
      const side = seed % 2 === 0 ? -1 : 1;
      const offset = side * (23 + (seed % 17));
      const size = { x: 8 + seed % 12, y: 5 + (seed % 12), z: 10 + (seed >>> 4) % 17 };
      const position = railOffsetPosition(this.nextIslandDistance, offset, size.y / 2 - 0.35);
      this.islands.push({ id: this.nextId++, position, size, rotation: (seed % 31) * 0.07, railDistance: this.nextIslandDistance });
      this.nextIslandDistance += ISLAND_SPACING;
    }

    while (this.nextEnemySection * SECTION_SPAN + 130 <= this.railDistance + STREAM_AHEAD) {
      this.spawnEnemyGroup(this.nextEnemySection++);
    }
  }

  private spawnEnemyGroup(sectionIndex: number) {
    const groupDistance = sectionIndex * SECTION_SPAN + 130;
    const formation = [[-5, 5], [0, 7], [5, 5], [-2.5, 3], [2.5, 3]];
    formation.forEach(([x, y], index) => {
      this.enemies.push({
        id: this.nextId++, position: railOffsetPosition(groupDistance, x, y), radius: 1.25,
        railDistance: groupDistance - index * 2, offsetX: x, offsetY: y, phase: sectionIndex * 1.7 + index,
        sectionIndex, controller: 'standard',
      });
    });
  }

  private updateEnemies(dt: number) {
    const playerPosition = railOffsetPosition(this.railDistance, this.player.offsetX, this.player.offsetY);
    const playerRail = railFrameAtDistance(this.railDistance);
    const context = {
      elapsed: this.elapsed,
      playerPosition,
      playerVelocity: {
        x: playerRail.forward.x * this.railSpeed + playerRail.right.x * this.player.velocityX,
        y: this.player.velocityY,
        z: playerRail.forward.z * this.railSpeed + playerRail.right.z * this.player.velocityX,
      },
      playerRailDistance: this.railDistance,
      playerShots: this.projectiles.filter((shot) => shot.owner === 'player'),
      enemies: this.enemies,
    };
    for (const enemy of this.enemies) {
      const scatterAt = enemy.sectionIndex * SECTION_SPAN + SECTION_LENGTH - ENEMY_SCATTER_LEAD;
      if (!enemy.scatterVelocity && this.railDistance >= scatterAt) {
        const rail = railFrameAtDistance(enemy.railDistance);
        const side = enemy.offsetX < 0 ? -1 : 1;
        enemy.scatterVelocity = { x: rail.right.x * side * 18 + rail.forward.x * 8, y: 8 + Math.abs(enemy.offsetX), z: rail.right.z * side * 18 + rail.forward.z * 8 };
      }
      if (enemy.scatterVelocity) {
        enemy.position.x += enemy.scatterVelocity.x * dt;
        enemy.position.y += enemy.scatterVelocity.y * dt;
        enemy.position.z += enemy.scatterVelocity.z * dt;
        continue;
      }
      const control = controlEnemy(enemy, context, dt);
      const tooClose = enemy.railDistance - this.railDistance <= ENEMY_MIN_PLAYER_DISTANCE;
      enemy.offsetX = clamp(enemy.offsetX + control.offsetVelocityX * dt, -FLIGHT_WINDOW.maxX, FLIGHT_WINDOW.maxX);
      enemy.offsetY = clamp(enemy.offsetY + control.offsetVelocityY * dt, FLIGHT_WINDOW.minY, FLIGHT_WINDOW.maxY);
      enemy.railDistance += (tooClose ? ENEMY_RETREAT_SPEED : ENEMY_FORWARD_SPEED + control.depthSpeed) * dt;
      enemy.position = railOffsetPosition(enemy.railDistance, enemy.offsetX, enemy.offsetY);
      if (!tooClose && control.fire) this.fireEnemyShot(enemy, playerPosition, context.playerVelocity);
    }
  }

  private fireEnemyShot(enemy: EnemyState, playerPosition: { x: number; y: number; z: number }, playerVelocity: { x: number; y: number; z: number }) {
    const distance = Math.sqrt(distanceSquared(enemy.position, playerPosition));
    const leadTime = Math.min(1.2, distance / ENEMY_SHOT_SPEED);
    const error = Math.sin(enemy.id * 12.9898 + this.elapsed * 2.1) * 2.2;
    const target = {
      x: playerPosition.x + playerVelocity.x * leadTime * 0.35 + error,
      y: playerPosition.y + playerVelocity.y * leadTime * 0.35 + error * 0.35,
      z: playerPosition.z + playerVelocity.z * leadTime * 0.35,
    };
    const dx = target.x - enemy.position.x, dy = target.y - enemy.position.y, dz = target.z - enemy.position.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    this.projectiles.push({ id: this.nextId++, position: { ...enemy.position }, velocity: { x: dx / length * ENEMY_SHOT_SPEED, y: dy / length * ENEMY_SHOT_SPEED, z: dz / length * ENEMY_SHOT_SPEED }, radius: 0.26, owner: 'enemy' });
  }
}

function hash(value: number) {
  let result = Math.imul(Math.floor(value) + 1, 0x45d9f3b);
  result = Math.imul(result ^ result >>> 16, 0x45d9f3b);
  return (result ^ result >>> 16) >>> 0;
}

function distanceSquared(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function moveTowards(value: number, target: number, maxDelta: number) {
  return Math.abs(target - value) <= maxDelta ? target : value + Math.sign(target - value) * maxDelta;
}
function removeWhere<T>(items: T[], predicate: (item: T) => boolean) {
  for (let i = items.length - 1; i >= 0; i--) if (predicate(items[i])) items.splice(i, 1);
}
