import type { Vec3 } from "../sim/types";

export const DEFAULT_GAMEPLAY_CAMERA_FOV = 62;

export type LevelIntroCameraPose = {
  position: Vec3;
  target: Vec3;
  fov: number;
  roll: number;
};

export function levelIntroCameraPose(
  railCenter: Vec3,
  shipPosition: Vec3,
  forward: Vec3,
  right: Vec3,
  defaultCameraDistance: number,
  progress: number,
): LevelIntroCameraPose {
  const eased = smootherStep(progress);
  const finalPosition = addScaled(railCenter, forward, -defaultCameraDistance);
  const startPosition = addScaled(
    addScaled(
      { x: railCenter.x, y: railCenter.y + 11, z: railCenter.z },
      forward,
      18,
    ),
    right,
    27,
  );
  const firstControl = addScaled(
    addScaled(
      { x: railCenter.x, y: railCenter.y + 8, z: railCenter.z },
      forward,
      3,
    ),
    right,
    19,
  );
  const secondControl = addScaled(
    { x: finalPosition.x, y: finalPosition.y + 3, z: finalPosition.z },
    right,
    8,
  );
  const openingTarget = addScaled(shipPosition, forward, 3.5);

  return {
    position: cubicBezier(
      startPosition,
      firstControl,
      secondControl,
      finalPosition,
      eased,
    ),
    target: lerpVec3(openingTarget, railCenter, eased),
    fov: lerp(50, DEFAULT_GAMEPLAY_CAMERA_FOV, eased),
    roll: -Math.sin(Math.PI * eased) * 0.045,
  };
}

function smootherStep(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10);
}

function addScaled(origin: Vec3, direction: Vec3, scale: number): Vec3 {
  return {
    x: origin.x + direction.x * scale,
    y: origin.y + direction.y * scale,
    z: origin.z + direction.z * scale,
  };
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function lerpVec3(start: Vec3, end: Vec3, progress: number): Vec3 {
  return {
    x: lerp(start.x, end.x, progress),
    y: lerp(start.y, end.y, progress),
    z: lerp(start.z, end.z, progress),
  };
}

function cubicBezier(
  start: Vec3,
  firstControl: Vec3,
  secondControl: Vec3,
  end: Vec3,
  progress: number,
): Vec3 {
  const inverse = 1 - progress;
  const startWeight = inverse * inverse * inverse;
  const firstWeight = 3 * inverse * inverse * progress;
  const secondWeight = 3 * inverse * progress * progress;
  const endWeight = progress * progress * progress;
  return {
    x:
      start.x * startWeight +
      firstControl.x * firstWeight +
      secondControl.x * secondWeight +
      end.x * endWeight,
    y:
      start.y * startWeight +
      firstControl.y * firstWeight +
      secondControl.y * secondWeight +
      end.y * endWeight,
    z:
      start.z * startWeight +
      firstControl.z * firstWeight +
      secondControl.z * secondWeight +
      end.z * endWeight,
  };
}
