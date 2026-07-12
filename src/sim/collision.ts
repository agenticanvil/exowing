import type { Vec3 } from "./types";

const axes = ["x", "y", "z"] as const;

export function distanceSquared(a: Vec3, b: Vec3) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function sweptSpheresIntersect(
  firstStart: Vec3,
  firstEnd: Vec3,
  secondStart: Vec3,
  secondEnd: Vec3,
  radius: number,
) {
  if (
    !axes.every(
      (axis) =>
        Math.min(firstStart[axis], firstEnd[axis]) <=
          Math.max(secondStart[axis], secondEnd[axis]) + radius &&
        Math.max(firstStart[axis], firstEnd[axis]) >=
          Math.min(secondStart[axis], secondEnd[axis]) - radius,
    )
  )
    return false;
  const start = subtract(firstStart, secondStart);
  const movement = subtract(
    subtract(firstEnd, firstStart),
    subtract(secondEnd, secondStart),
  );
  const movementSquared = dot(movement, movement);
  const closestTime =
    movementSquared === 0
      ? 0
      : clamp(-dot(start, movement) / movementSquared, 0, 1);
  const closest = {
    x: start.x + movement.x * closestTime,
    y: start.y + movement.y * closestTime,
    z: start.z + movement.z * closestTime,
  };
  return dot(closest, closest) <= radius * radius;
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
