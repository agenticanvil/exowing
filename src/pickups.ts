export const PICKUP_IDS = [
  "shield",
  "overshield",
  "rapid-fire",
  "overcharged-bolts",
  "spread-shot",
  "homing-missiles",
  "chain-lightning",
] as const;

export type PickupId = (typeof PICKUP_IDS)[number];
export const TIMED_PICKUP_IDS = [
  "overshield",
  "rapid-fire",
  "overcharged-bolts",
  "spread-shot",
  "chain-lightning",
] as const;
export type TimedPickupId = (typeof TIMED_PICKUP_IDS)[number];
export const TACTICAL_PICKUP_IDS = PICKUP_IDS;

export type PickupDefinition = {
  id: PickupId;
  label: string;
  modelUrl: string;
};

export const PICKUPS: Record<PickupId, PickupDefinition> = {
  shield: {
    id: "shield",
    label: "Shield",
    modelUrl: new URL(
      "../assets/pickups/shield-pickup/shield-pickup.glb",
      import.meta.url,
    ).href,
  },
  overshield: {
    id: "overshield",
    label: "Overshield",
    modelUrl: new URL(
      "../assets/pickups/overshield-pickup/overshield-pickup.glb",
      import.meta.url,
    ).href,
  },
  "rapid-fire": {
    id: "rapid-fire",
    label: "Rapid Fire",
    modelUrl: new URL(
      "../assets/pickups/rapid-fire-pickup/rapid-fire-pickup.glb",
      import.meta.url,
    ).href,
  },
  "overcharged-bolts": {
    id: "overcharged-bolts",
    label: "Overcharged Bolts",
    modelUrl: new URL(
      "../assets/pickups/overcharged-bolts-pickup/overcharged-bolts-pickup.glb",
      import.meta.url,
    ).href,
  },
  "spread-shot": {
    id: "spread-shot",
    label: "Spread Shot",
    modelUrl: new URL(
      "../assets/pickups/spread-shot-pickup/spread-shot-pickup.glb",
      import.meta.url,
    ).href,
  },
  "homing-missiles": {
    id: "homing-missiles",
    label: "Homing Missiles",
    modelUrl: new URL(
      "../assets/pickups/homing-missiles-pickup/homing-missiles-pickup.glb",
      import.meta.url,
    ).href,
  },
  "chain-lightning": {
    id: "chain-lightning",
    label: "Chain Lightning",
    modelUrl: new URL(
      "../assets/pickups/chain-lightning-pickup/chain-lightning-pickup.glb",
      import.meta.url,
    ).href,
  },
};

export const PICKUP_DROP_CHANCE = 0.2;
export const PICKUP_MAGNET_DISTANCE = 12;
export const PICKUP_COLLECTION_DISTANCE = 1.8;

export const PICKUP_EFFECTS = {
  shieldRestore: 2,
  overshieldAmount: 3,
  timedDuration: 10,
  rapidFireIntervalMultiplier: 0.65,
  overchargedBoltDamageMultiplier: 2,
  spreadShotDamage: 0.65,
  homingMissileAmmo: 4,
  maxHomingMissiles: 8,
} as const;

export function isTimedPickup(pickupId: PickupId): pickupId is TimedPickupId {
  return (TIMED_PICKUP_IDS as readonly PickupId[]).includes(pickupId);
}
