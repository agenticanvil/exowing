export type EnemyId = "riftspike" | "thornwing" | "riftmaw";
export type StandardEnemyId = "riftspike" | "thornwing";
export type EnemyKind = "standard" | "boss";
export type EnemyControllerId = "standard" | "formation" | "boss";

export type EnemyDefinition = {
  id: EnemyId;
  label: string;
  modelUrl: string;
  kind: EnemyKind;
  controller: EnemyControllerId;
  radius: number;
  baseHealth: number;
  forwardSpeed: number;
  retreatSpeed: number;
  shot: {
    speed: number;
    radius: number;
    damage: number;
    spreads: readonly number[];
  };
  score: number;
  destructionDuration: number;
  destructionFragments: number;
};

export const ENEMIES: Record<EnemyId, EnemyDefinition> = {
  riftspike: {
    id: "riftspike",
    label: "Riftspike",
    modelUrl: new URL(
      "../assets/enemies/riftspike/riftspike.glb",
      import.meta.url,
    ).href,
    kind: "standard",
    controller: "standard",
    radius: 1.25,
    baseHealth: 1,
    forwardSpeed: 7,
    retreatSpeed: 32,
    shot: { speed: 38, radius: 0.26, damage: 1, spreads: [0] },
    score: 100,
    destructionDuration: 1.25,
    destructionFragments: 8,
  },
  thornwing: {
    id: "thornwing",
    label: "Thornwing",
    modelUrl: new URL(
      "../assets/enemies/thornwing/thornwing.glb",
      import.meta.url,
    ).href,
    kind: "standard",
    controller: "standard",
    radius: 1.25,
    baseHealth: 1,
    forwardSpeed: 7,
    retreatSpeed: 32,
    shot: { speed: 38, radius: 0.26, damage: 1, spreads: [0] },
    score: 100,
    destructionDuration: 1.25,
    destructionFragments: 8,
  },
  riftmaw: {
    id: "riftmaw",
    label: "Riftmaw",
    modelUrl: new URL("../assets/enemies/riftmaw/riftmaw.glb", import.meta.url)
      .href,
    kind: "boss",
    controller: "boss",
    radius: 3.5,
    baseHealth: 24,
    forwardSpeed: 7,
    retreatSpeed: 32,
    shot: {
      speed: 48,
      radius: 0.34,
      damage: 1,
      spreads: [-0.12, 0, 0.12],
    },
    score: 2500,
    destructionDuration: 1.8,
    destructionFragments: 12,
  },
};

export type EnemyFormationPoint = readonly [x: number, y: number];

export type EnemyGroupDefinition = {
  enemy: EnemyId;
  formation: readonly EnemyFormationPoint[];
  railSpacing?: number;
  phaseOffset?: number;
};

export type EnemyWaveDefinition = {
  spawnAtRailDistance: number;
  enemyRailDistance: number;
  exitAtRailDistance?: number;
  requiresPreviousWaveResolved?: boolean;
  groups: readonly EnemyGroupDefinition[];
};

export type LevelEnemyPlan = {
  waves: readonly EnemyWaveDefinition[];
};

export function enemyIdsForPlan(plan: LevelEnemyPlan): EnemyId[] {
  return [
    ...new Set(
      plan.waves.flatMap((wave) => wave.groups.map((group) => group.enemy)),
    ),
  ];
}
