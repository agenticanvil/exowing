import type { Vec3 } from "../sim/types";
import { DEFAULT_GAMEPLAY_CAMERA_FOV } from "./levelIntroCamera";

const SHIP_CLIMB_DISTANCE = 58;
const SHIP_FORWARD_DISTANCE = 34;
const SHIP_DRIFT_DISTANCE = 1.5;
const STRAIGHT_FLIGHT_SECONDS = 0.5;

export type LevelOutroPose = {
  cameraPosition: Vec3;
  cameraTarget: Vec3;
  cameraFov: number;
  shipPosition: Vec3;
  shipPitch: number;
  shipRoll: number;
};

export function levelOutroPose(
  railCenter: Vec3,
  shipPosition: Vec3,
  forward: Vec3,
  right: Vec3,
  defaultCameraDistance: number,
  initialShipPitch: number,
  initialShipRoll: number,
  progress: number,
  elapsedSeconds: number,
  durationSeconds: number,
): LevelOutroPose {
  const cameraProgress = smootherStep(progress);
  const straightProgress = smootherStep(
    Math.max(0, Math.min(1, elapsedSeconds / STRAIGHT_FLIGHT_SECONDS)),
  );
  const ascentDuration = Math.max(
    0.001,
    durationSeconds - STRAIGHT_FLIGHT_SECONDS,
  );
  const ascentProgress = smootherStep(
    Math.max(
      0,
      Math.min(1, (elapsedSeconds - STRAIGHT_FLIGHT_SECONDS) / ascentDuration),
    ),
  );
  const climbProgress = ascentProgress * ascentProgress;
  const defaultCameraPosition = addScaled(
    railCenter,
    forward,
    -defaultCameraDistance,
  );
  const cameraPosition = addScaled(
    {
      x: defaultCameraPosition.x,
      y: defaultCameraPosition.y - cameraProgress * 3.2,
      z: defaultCameraPosition.z,
    },
    forward,
    cameraProgress * 3,
  );
  const cameraTarget = addScaled(
    {
      x: railCenter.x,
      y: railCenter.y + cameraProgress * 11,
      z: railCenter.z,
    },
    forward,
    cameraProgress * 10,
  );
  const liftedShip = addScaled(
    {
      x: shipPosition.x,
      y: shipPosition.y + climbProgress * SHIP_CLIMB_DISTANCE,
      z: shipPosition.z,
    },
    forward,
    ascentProgress * SHIP_FORWARD_DISTANCE,
  );
  const ascentPitch =
    ascentProgress === 0
      ? 0
      : -Math.atan2(
          2 * SHIP_CLIMB_DISTANCE * ascentProgress,
          Math.hypot(
            SHIP_FORWARD_DISTANCE,
            2 * SHIP_DRIFT_DISTANCE * ascentProgress,
          ),
        );

  return {
    cameraPosition,
    cameraTarget,
    cameraFov: lerp(DEFAULT_GAMEPLAY_CAMERA_FOV, 58, cameraProgress),
    shipPosition: addScaled(
      liftedShip,
      right,
      climbProgress * SHIP_DRIFT_DISTANCE,
    ),
    shipPitch:
      elapsedSeconds < STRAIGHT_FLIGHT_SECONDS
        ? lerp(initialShipPitch, 0, straightProgress)
        : ascentPitch,
    shipRoll: lerp(initialShipRoll, 0, straightProgress),
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
