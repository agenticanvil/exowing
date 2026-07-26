export type EnemyId =
  | "riftspike"
  | "thornwing"
  | "reefclaw-skimmer"
  | "tideglass-manta"
  | "stormneedle-kite"
  | "gloomjelly"
  | "cinderback-bomber"
  | "gravemill"
  | "cryofin-ray"
  | "ironbark-hornet"
  | "riftmaw";
export type StandardEnemyId = Exclude<EnemyId, "riftmaw">;
export type EnemyKind = "standard" | "boss";
export type EnemyControllerId = "standard" | "formation" | "boss";

export type EnemyMovementDefinition = {
  decisionInterval: number;
  dodgeStrength: number;
  separationStrength: number;
  horizontalAmplitude: number;
  horizontalFrequency: number;
  verticalAmplitude: number;
  verticalFrequency: number;
  depthAmplitude: number;
  depthFrequency: number;
  maxHorizontalSpeed: number;
  maxVerticalSpeed: number;
};

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
  movement?: EnemyMovementDefinition;
  shot: {
    speed: number;
    radius: number;
    damage: number;
    spreads: readonly number[];
    interval: number;
    range: number;
    lead: number;
    aimError: number;
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
    movement: {
      decisionInterval: 0.2,
      dodgeStrength: 0.85,
      separationStrength: 1,
      horizontalAmplitude: 2.2,
      horizontalFrequency: 1.05,
      verticalAmplitude: 1.1,
      verticalFrequency: 0.85,
      depthAmplitude: 2.8,
      depthFrequency: 0.48,
      maxHorizontalSpeed: 6.5,
      maxVerticalSpeed: 4.5,
    },
    shot: {
      speed: 38,
      radius: 0.25,
      damage: 0.75,
      spreads: [0],
      interval: 1.7,
      range: 118,
      lead: 0.25,
      aimError: 2.8,
    },
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
    movement: {
      decisionInterval: 0.17,
      dodgeStrength: 1.1,
      separationStrength: 1,
      horizontalAmplitude: 3.4,
      horizontalFrequency: 1.35,
      verticalAmplitude: 1.8,
      verticalFrequency: 1.1,
      depthAmplitude: 3.2,
      depthFrequency: 0.62,
      maxHorizontalSpeed: 7.5,
      maxVerticalSpeed: 5.5,
    },
    shot: {
      speed: 40,
      radius: 0.24,
      damage: 0.7,
      spreads: [0],
      interval: 1.55,
      range: 122,
      lead: 0.3,
      aimError: 2.5,
    },
    score: 100,
    destructionDuration: 1.25,
    destructionFragments: 8,
  },
  "reefclaw-skimmer": {
    id: "reefclaw-skimmer",
    label: "Reefclaw Skimmer",
    modelUrl: new URL(
      "../assets/enemies/reefclaw-skimmer/reefclaw-skimmer.glb",
      import.meta.url,
    ).href,
    kind: "standard",
    controller: "standard",
    radius: 1.35,
    baseHealth: 2,
    forwardSpeed: 6.5,
    retreatSpeed: 31,
    movement: {
      decisionInterval: 0.28,
      dodgeStrength: 0.55,
      separationStrength: 1.2,
      horizontalAmplitude: 1.6,
      horizontalFrequency: 0.7,
      verticalAmplitude: 0.7,
      verticalFrequency: 0.6,
      depthAmplitude: 2,
      depthFrequency: 0.42,
      maxHorizontalSpeed: 5,
      maxVerticalSpeed: 3.5,
    },
    shot: {
      speed: 36,
      radius: 0.28,
      damage: 0.75,
      spreads: [0],
      interval: 1.85,
      range: 112,
      lead: 0.2,
      aimError: 3,
    },
    score: 140,
    destructionDuration: 1.3,
    destructionFragments: 9,
  },
  "tideglass-manta": {
    id: "tideglass-manta",
    label: "Tideglass Manta",
    modelUrl: new URL(
      "../assets/enemies/tideglass-manta/tideglass-manta.glb",
      import.meta.url,
    ).href,
    kind: "standard",
    controller: "standard",
    radius: 1.4,
    baseHealth: 1,
    forwardSpeed: 7.5,
    retreatSpeed: 34,
    movement: {
      decisionInterval: 0.2,
      dodgeStrength: 0.9,
      separationStrength: 1,
      horizontalAmplitude: 4.5,
      horizontalFrequency: 0.58,
      verticalAmplitude: 1.2,
      verticalFrequency: 0.68,
      depthAmplitude: 3.2,
      depthFrequency: 0.5,
      maxHorizontalSpeed: 7,
      maxVerticalSpeed: 4.5,
    },
    shot: {
      speed: 35,
      radius: 0.23,
      damage: 0.4,
      spreads: [-0.05, 0.05],
      interval: 1.65,
      range: 118,
      lead: 0.28,
      aimError: 2.6,
    },
    score: 130,
    destructionDuration: 1.2,
    destructionFragments: 8,
  },
  "stormneedle-kite": {
    id: "stormneedle-kite",
    label: "Stormneedle Kite",
    modelUrl: new URL(
      "../assets/enemies/stormneedle-kite/stormneedle-kite.glb",
      import.meta.url,
    ).href,
    kind: "standard",
    controller: "standard",
    radius: 1.25,
    baseHealth: 1,
    forwardSpeed: 9,
    retreatSpeed: 38,
    movement: {
      decisionInterval: 0.13,
      dodgeStrength: 1.3,
      separationStrength: 0.85,
      horizontalAmplitude: 5.5,
      horizontalFrequency: 1.8,
      verticalAmplitude: 2.2,
      verticalFrequency: 1.35,
      depthAmplitude: 4.5,
      depthFrequency: 0.8,
      maxHorizontalSpeed: 9.5,
      maxVerticalSpeed: 6.5,
    },
    shot: {
      speed: 52,
      radius: 0.2,
      damage: 0.65,
      spreads: [0],
      interval: 1.45,
      range: 132,
      lead: 0.45,
      aimError: 1.8,
    },
    score: 150,
    destructionDuration: 1.05,
    destructionFragments: 8,
  },
  gloomjelly: {
    id: "gloomjelly",
    label: "Gloomjelly",
    modelUrl: new URL(
      "../assets/enemies/gloomjelly/gloomjelly.glb",
      import.meta.url,
    ).href,
    kind: "standard",
    controller: "standard",
    radius: 1.35,
    baseHealth: 2,
    forwardSpeed: 5.8,
    retreatSpeed: 28,
    movement: {
      decisionInterval: 0.32,
      dodgeStrength: 0.45,
      separationStrength: 1.3,
      horizontalAmplitude: 1.4,
      horizontalFrequency: 0.5,
      verticalAmplitude: 2.8,
      verticalFrequency: 0.78,
      depthAmplitude: 1.6,
      depthFrequency: 0.36,
      maxHorizontalSpeed: 4,
      maxVerticalSpeed: 4,
    },
    shot: {
      speed: 31,
      radius: 0.28,
      damage: 0.32,
      spreads: [-0.14, 0, 0.14],
      interval: 2.1,
      range: 108,
      lead: 0.18,
      aimError: 3.5,
    },
    score: 170,
    destructionDuration: 1.4,
    destructionFragments: 10,
  },
  "cinderback-bomber": {
    id: "cinderback-bomber",
    label: "Cinderback Bomber",
    modelUrl: new URL(
      "../assets/enemies/cinderback-bomber/cinderback-bomber.glb",
      import.meta.url,
    ).href,
    kind: "standard",
    controller: "standard",
    radius: 1.5,
    baseHealth: 3,
    forwardSpeed: 5.5,
    retreatSpeed: 27,
    movement: {
      decisionInterval: 0.4,
      dodgeStrength: 0.25,
      separationStrength: 1.35,
      horizontalAmplitude: 1,
      horizontalFrequency: 0.45,
      verticalAmplitude: 0.6,
      verticalFrequency: 0.52,
      depthAmplitude: 1.2,
      depthFrequency: 0.32,
      maxHorizontalSpeed: 3.8,
      maxVerticalSpeed: 2.8,
    },
    shot: {
      speed: 29,
      radius: 0.36,
      damage: 0.44,
      spreads: [-0.1, 0.1],
      interval: 2.4,
      range: 105,
      lead: 0.16,
      aimError: 3.2,
    },
    score: 220,
    destructionDuration: 1.5,
    destructionFragments: 11,
  },
  gravemill: {
    id: "gravemill",
    label: "Gravemill",
    modelUrl: new URL(
      "../assets/enemies/gravemill/gravemill.glb",
      import.meta.url,
    ).href,
    kind: "standard",
    controller: "standard",
    radius: 1.55,
    baseHealth: 3,
    forwardSpeed: 5.2,
    retreatSpeed: 26,
    movement: {
      decisionInterval: 0.34,
      dodgeStrength: 0.35,
      separationStrength: 1.4,
      horizontalAmplitude: 2.8,
      horizontalFrequency: 0.74,
      verticalAmplitude: 0.9,
      verticalFrequency: 0.58,
      depthAmplitude: 1,
      depthFrequency: 0.3,
      maxHorizontalSpeed: 4.8,
      maxVerticalSpeed: 3.2,
    },
    shot: {
      speed: 26,
      radius: 0.42,
      damage: 0.9,
      spreads: [0],
      interval: 2.8,
      range: 100,
      lead: 0.1,
      aimError: 3.4,
    },
    score: 240,
    destructionDuration: 1.55,
    destructionFragments: 12,
  },
  "cryofin-ray": {
    id: "cryofin-ray",
    label: "Cryofin Ray",
    modelUrl: new URL(
      "../assets/enemies/cryofin-ray/cryofin-ray.glb",
      import.meta.url,
    ).href,
    kind: "standard",
    controller: "standard",
    radius: 1.35,
    baseHealth: 2,
    forwardSpeed: 8,
    retreatSpeed: 35,
    movement: {
      decisionInterval: 0.16,
      dodgeStrength: 1.1,
      separationStrength: 0.95,
      horizontalAmplitude: 5,
      horizontalFrequency: 0.68,
      verticalAmplitude: 1.7,
      verticalFrequency: 0.9,
      depthAmplitude: 3.8,
      depthFrequency: 0.68,
      maxHorizontalSpeed: 8.5,
      maxVerticalSpeed: 5.8,
    },
    shot: {
      speed: 45,
      radius: 0.23,
      damage: 0.38,
      spreads: [-0.045, 0.045],
      interval: 1.55,
      range: 125,
      lead: 0.38,
      aimError: 2,
    },
    score: 180,
    destructionDuration: 1.25,
    destructionFragments: 9,
  },
  "ironbark-hornet": {
    id: "ironbark-hornet",
    label: "Ironbark Hornet",
    modelUrl: new URL(
      "../assets/enemies/ironbark-hornet/ironbark-hornet.glb",
      import.meta.url,
    ).href,
    kind: "standard",
    controller: "standard",
    radius: 1.25,
    baseHealth: 2,
    forwardSpeed: 8.5,
    retreatSpeed: 36,
    movement: {
      decisionInterval: 0.14,
      dodgeStrength: 1.25,
      separationStrength: 0.8,
      horizontalAmplitude: 3.8,
      horizontalFrequency: 1.55,
      verticalAmplitude: 2.8,
      verticalFrequency: 1.3,
      depthAmplitude: 4,
      depthFrequency: 0.75,
      maxHorizontalSpeed: 9,
      maxVerticalSpeed: 6.5,
    },
    shot: {
      speed: 48,
      radius: 0.2,
      damage: 0.25,
      spreads: [-0.07, 0, 0.07],
      interval: 1.45,
      range: 130,
      lead: 0.5,
      aimError: 1.6,
    },
    score: 190,
    destructionDuration: 1.15,
    destructionFragments: 9,
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
      damage: 0.48,
      spreads: [-0.12, 0, 0.12],
      interval: 0.62,
      range: 160,
      lead: 0.35,
      aimError: 2.2,
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
