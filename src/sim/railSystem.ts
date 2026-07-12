import type { Vec3 } from "./types";

export const RAIL_SPEED = 15;
export const SECTION_DURATION = 20;
export const SECTION_LENGTH = RAIL_SPEED * SECTION_DURATION;
export const TURN_START_DISTANCE = SECTION_LENGTH;
export const TURN_LENGTH = 60;
export const TURN_ANGLE = Math.PI / 4;
export const SECTION_SPAN = SECTION_LENGTH + TURN_LENGTH;

export type RailFrame = {
  position: Vec3;
  forward: Vec3;
  right: Vec3;
  heading: number;
};

/** Infinite, deterministic 30-second straights joined by alternating random-looking bends. */
export function railFrameAtDistance(distance: number): RailFrame {
  const safeDistance = Math.max(0, distance);
  const sectionIndex = Math.floor(safeDistance / SECTION_SPAN);
  let position = { x: 0, y: 0, z: 0 };
  let heading = 0;

  for (let index = 0; index < sectionIndex; index++) {
    ({ position, heading } = advanceSection(
      position,
      heading,
      bendDirectionForSection(index),
    ));
  }

  const localDistance = safeDistance - sectionIndex * SECTION_SPAN;
  const straightDistance = Math.min(localDistance, SECTION_LENGTH);
  position = advanceStraight(position, heading, straightDistance);
  if (localDistance <= SECTION_LENGTH) return frame(position, heading);

  return arcFrame(
    position,
    heading,
    localDistance - SECTION_LENGTH,
    bendDirectionForSection(sectionIndex),
  );
}

export function railOffsetPosition(
  distance: number,
  offsetX: number,
  offsetY: number,
): Vec3 {
  const rail = railFrameAtDistance(distance);
  return {
    x: rail.position.x + rail.right.x * offsetX,
    y: rail.position.y + offsetY,
    z: rail.position.z + rail.right.z * offsetX,
  };
}

export function bendDirectionForSection(sectionIndex: number): -1 | 1 {
  let value = (sectionIndex + 1) * 0x9e3779b1;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad);
  value ^= value >>> 15;
  return (value & 1) === 0 ? -1 : 1;
}

function advanceSection(position: Vec3, heading: number, direction: -1 | 1) {
  const straightEnd = advanceStraight(position, heading, SECTION_LENGTH);
  const end = arcFrame(straightEnd, heading, TURN_LENGTH, direction);
  return { position: end.position, heading: end.heading };
}

function advanceStraight(
  position: Vec3,
  heading: number,
  distance: number,
): Vec3 {
  return {
    x: position.x - Math.sin(heading) * distance,
    y: 0,
    z: position.z + Math.cos(heading) * distance,
  };
}

function arcFrame(
  position: Vec3,
  heading: number,
  distance: number,
  direction: -1 | 1,
): RailFrame {
  const radius = TURN_LENGTH / TURN_ANGLE;
  const angle = (Math.min(distance, TURN_LENGTH) / radius) * direction;
  const nextHeading = heading + angle;
  const centerX = position.x - Math.cos(heading) * radius * direction;
  const centerZ = position.z - Math.sin(heading) * radius * direction;
  const nextPosition = {
    x: centerX + Math.cos(nextHeading) * radius * direction,
    y: 0,
    z: centerZ + Math.sin(nextHeading) * radius * direction,
  };
  return frame(nextPosition, nextHeading);
}

function frame(position: Vec3, heading: number): RailFrame {
  return {
    position,
    heading,
    forward: { x: -Math.sin(heading), y: 0, z: Math.cos(heading) },
    right: { x: -Math.cos(heading), y: 0, z: -Math.sin(heading) },
  };
}
