export const UPGRADE_IDS = [
  "calibrated-emitters",
  "magnetic-bolts",
  "twin-bolts",
  "overdrive-core",
  "faster-lock",
  "extra-lock",
  "heavy-warheads",
  "salvo-protocol",
  "reinforced-shield",
  "phase-roll",
  "reflex-actuators",
  "reflex-core",
] as const;

export type UpgradeId = (typeof UPGRADE_IDS)[number];
export type UpgradeBranchId = "gunnery" | "ordnance" | "airframe";
export type UpgradeStatus = "selected" | "available" | "locked" | "excluded";

export type UpgradeDefinition = {
  id: UpgradeId;
  branch: UpgradeBranchId;
  tier: 1 | 2 | 3;
  label: string;
  detail: string;
  tradeoff?: string;
  requirements?: readonly UpgradeId[];
  requirementMode?: "all" | "any";
  excludes?: readonly UpgradeId[];
};

export const UPGRADES: Record<UpgradeId, UpgradeDefinition> = {
  "calibrated-emitters": {
    id: "calibrated-emitters",
    branch: "gunnery",
    tier: 1,
    label: "Calibrated Emitters",
    detail: "Primary weapons fire 15% faster.",
  },
  "magnetic-bolts": {
    id: "magnetic-bolts",
    branch: "gunnery",
    tier: 2,
    label: "Magnetic Bolts",
    detail:
      "Improved aim widens auto-aim and bends bolts slightly toward nearby targets.",
    tradeoff: "Locks Twin Bolts.",
    requirements: ["calibrated-emitters"],
    excludes: ["twin-bolts"],
  },
  "twin-bolts": {
    id: "twin-bolts",
    branch: "gunnery",
    tier: 2,
    label: "Twin Bolts",
    detail: "Fire two bolts at 75% damage each in a close spread.",
    tradeoff: "Locks Magnetic Bolts.",
    requirements: ["calibrated-emitters"],
    excludes: ["magnetic-bolts"],
  },
  "overdrive-core": {
    id: "overdrive-core",
    branch: "gunnery",
    tier: 3,
    label: "Overdrive Core",
    detail: "Every ten primary hits triggers 2.5 seconds of 30% faster fire.",
    requirements: ["magnetic-bolts", "twin-bolts"],
    requirementMode: "any",
  },
  "faster-lock": {
    id: "faster-lock",
    branch: "ordnance",
    tier: 1,
    label: "Fast Acquisition",
    detail: "Missile locks acquire 35% faster.",
  },
  "extra-lock": {
    id: "extra-lock",
    branch: "ordnance",
    tier: 2,
    label: "Expanded Rack",
    detail: "Lock one additional missile target per salvo.",
    tradeoff: "Locks Heavy Warheads.",
    requirements: ["faster-lock"],
    excludes: ["heavy-warheads"],
  },
  "heavy-warheads": {
    id: "heavy-warheads",
    branch: "ordnance",
    tier: 2,
    label: "Heavy Warheads",
    detail: "Missiles deal 50% more damage, but maximum locks fall to two.",
    tradeoff: "Locks Expanded Rack.",
    requirements: ["faster-lock"],
    excludes: ["extra-lock"],
  },
  "salvo-protocol": {
    id: "salvo-protocol",
    branch: "ordnance",
    tier: 3,
    label: "Salvo Protocol",
    detail:
      "Missiles steer 20% harder and retarget a nearby enemy once if their target is destroyed.",
    requirements: ["extra-lock", "heavy-warheads"],
    requirementMode: "any",
  },
  "reinforced-shield": {
    id: "reinforced-shield",
    branch: "airframe",
    tier: 1,
    label: "Reinforced Shield",
    detail: "Increase maximum shield by one point and restore one shield.",
  },
  "phase-roll": {
    id: "phase-roll",
    branch: "airframe",
    tier: 2,
    label: "Phase Roll",
    detail: "Extend barrel-roll invulnerability from 0.5 to 0.6 seconds.",
    tradeoff: "Locks Reflex Actuators.",
    requirements: ["reinforced-shield"],
    excludes: ["reflex-actuators"],
  },
  "reflex-actuators": {
    id: "reflex-actuators",
    branch: "airframe",
    tier: 2,
    label: "Reflex Actuators",
    detail: "Shorten the post-roll cooldown from 1 to 0.8 seconds.",
    tradeoff: "Locks Phase Roll.",
    requirements: ["reinforced-shield"],
    excludes: ["phase-roll"],
  },
  "reflex-core": {
    id: "reflex-core",
    branch: "airframe",
    tier: 3,
    label: "Reflex Core",
    detail:
      "Rolling close to hostile fire grants two seconds of 30% faster primary fire.",
    requirements: ["phase-roll", "reflex-actuators"],
    requirementMode: "any",
  },
};

export const UPGRADE_BRANCHES = [
  {
    id: "gunnery",
    label: "Gunnery",
    specialty: "Primary weapons",
    root: "calibrated-emitters",
    forks: ["magnetic-bolts", "twin-bolts"],
    capstone: "overdrive-core",
  },
  {
    id: "ordnance",
    label: "Ordnance",
    specialty: "Missile systems",
    root: "faster-lock",
    forks: ["extra-lock", "heavy-warheads"],
    capstone: "salvo-protocol",
  },
  {
    id: "airframe",
    label: "Airframe",
    specialty: "Defense and evasion",
    root: "reinforced-shield",
    forks: ["phase-roll", "reflex-actuators"],
    capstone: "reflex-core",
  },
] as const satisfies readonly {
  id: UpgradeBranchId;
  label: string;
  specialty: string;
  root: UpgradeId;
  forks: readonly [UpgradeId, UpgradeId];
  capstone: UpgradeId;
}[];

export function upgradeStatus(
  upgradeId: UpgradeId,
  selectedUpgrades: readonly UpgradeId[],
): UpgradeStatus {
  const selected = new Set(selectedUpgrades);
  if (selected.has(upgradeId)) return "selected";
  const definition = UPGRADES[upgradeId];
  if (definition.excludes?.some((excluded) => selected.has(excluded)))
    return "excluded";
  const requirements = definition.requirements ?? [];
  const requirementsMet =
    requirements.length === 0 ||
    (definition.requirementMode === "any"
      ? requirements.some((requirement) => selected.has(requirement))
      : requirements.every((requirement) => selected.has(requirement)));
  return requirementsMet ? "available" : "locked";
}

export function availableUpgrades(
  selectedUpgrades: readonly UpgradeId[],
): UpgradeId[] {
  return UPGRADE_IDS.filter(
    (upgradeId) => upgradeStatus(upgradeId, selectedUpgrades) === "available",
  );
}

export function upgradesUnlockedBy(upgradeId: UpgradeId): UpgradeId[] {
  return UPGRADE_IDS.filter((candidateId) =>
    UPGRADES[candidateId].requirements?.includes(upgradeId),
  );
}

export function hasUpgradeAfterLevel(level: number) {
  return level >= 1 && level < 6;
}
