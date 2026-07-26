import { islandField } from "./world/islandSystem";
import { oceanSurface } from "./world/waterSystem";
import { desertCanyon } from "./world/desertCanyonSystem";
import { asteroidBelt } from "./world/asteroidBeltSystem";
import { alpineSnowfields } from "./world/alpineSnowfieldsSystem";
import { borealForest } from "./world/borealForestSystem";
import type { LevelEnemyPlan } from "./enemies";
import { createStandardEnemyPlan } from "./game/enemyEncounters";
import type {
  LevelEnvironment,
  WorldSystemDefinition,
} from "./world/worldSystem";

export type LevelId = 1 | 2 | 3 | 4 | 5 | 6;

export type LevelDefinition = {
  id: LevelId;
  name: string;
  enemies: LevelEnemyPlan;
  environment: LevelEnvironment;
  systems: readonly WorldSystemDefinition[];
};

export const LEVELS: Record<LevelId, LevelDefinition> = {
  1: {
    id: 1,
    name: "Azure Reach",
    enemies: createStandardEnemyPlan("riftspike"),
    environment: {
      atmosphere: true,
      wispyClouds: true,
      horizon: 0x9bd8ee,
      zenith: 0x238ed1,
      upperSky: 0x69bde7,
      sunset: 0xffc47c,
      sunDirection: [-0.48, 0.32, 0.75],
      sunColor: 0xfff1d5,
      sunIntensity: 2.2,
      hemisphereSky: 0xd9f1ff,
      hemisphereGround: 0x304b39,
      hemisphereIntensity: 2.5,
      skySunIntensity: 1,
      exposure: 1,
    },
    systems: [
      oceanSurface({
        deep: 0x03445d,
        face: 0x008f95,
        horizon: 0x25bdb5,
        foam: 0xe8fff8,
      }),
      islandField({ style: "weathered", color: 0x8b714d }),
    ],
  },
  2: {
    id: 2,
    name: "Tempest Shards",
    enemies: createStandardEnemyPlan(["stormneedle-kite", "gloomjelly"]),
    environment: {
      atmosphere: true,
      wispyClouds: true,
      horizon: 0x344954,
      zenith: 0x07131f,
      upperSky: 0x172c3a,
      sunset: 0x687780,
      sunDirection: [-0.36, 0.48, 0.8],
      sunColor: 0xaab8bd,
      sunIntensity: 0.8,
      hemisphereSky: 0x67808b,
      hemisphereGround: 0x071014,
      hemisphereIntensity: 1.25,
      skySunIntensity: 0.2,
      exposure: 0.72,
    },
    systems: [
      oceanSurface({
        deep: 0x020d18,
        face: 0x0a2c3b,
        horizon: 0x174753,
        foam: 0x78c5c7,
      }),
      islandField({ style: "spires", color: 0x172329 }),
    ],
  },
  3: {
    id: 3,
    name: "Sunscar Canyon",
    enemies: createStandardEnemyPlan("cinderback-bomber"),
    environment: {
      atmosphere: true,
      wispyClouds: true,
      horizon: 0xe9a45f,
      zenith: 0x72bdd5,
      upperSky: 0xb8dce2,
      sunset: 0xffc27b,
      sunDirection: [-0.55, 0.5, 0.66],
      sunColor: 0xffd7a1,
      sunIntensity: 2.35,
      hemisphereSky: 0xcde7e8,
      hemisphereGround: 0x713b27,
      hemisphereIntensity: 2.1,
      skySunIntensity: 0.75,
      exposure: 0.9,
    },
    systems: [
      desertCanyon({ sand: 0xc9823f, rock: [0x9a4027, 0xc45f31, 0xe18443] }),
    ],
  },
  4: {
    id: 4,
    name: "Umbra Belt",
    enemies: createStandardEnemyPlan("gravemill"),
    environment: {
      atmosphere: false,
      wispyClouds: false,
      horizon: 0x101a2c,
      zenith: 0x010207,
      upperSky: 0x18213b,
      sunset: 0x824943,
      sunDirection: [-0.58, 0.42, 0.7],
      sunColor: 0xffb77f,
      sunIntensity: 2.25,
      hemisphereSky: 0x6d9cb2,
      hemisphereGround: 0x261821,
      hemisphereIntensity: 1.35,
      skySunIntensity: 0.15,
      exposure: 0.92,
    },
    systems: [
      asteroidBelt({ rock: [0x414555, 0x676370, 0x8a6552], dust: 0x77d9df }),
    ],
  },
  5: {
    id: 5,
    name: "Frostspire Vale",
    enemies: createStandardEnemyPlan("cryofin-ray"),
    environment: {
      atmosphere: true,
      wispyClouds: true,
      horizon: 0xcbddeb,
      zenith: 0x3977ad,
      upperSky: 0x7fb0d1,
      sunset: 0xffc8a6,
      sunDirection: [-0.56, 0.42, 0.7],
      sunColor: 0xffe5cf,
      sunIntensity: 2.15,
      hemisphereSky: 0xe1f3ff,
      hemisphereGround: 0x52677a,
      hemisphereIntensity: 2.35,
      skySunIntensity: 0.68,
      exposure: 0.9,
    },
    systems: [
      alpineSnowfields({
        snow: [0xf7fbff, 0xdbe9f4, 0xa9c2d8],
        rock: [0x253448, 0x42556c, 0x687d91],
        ice: 0x55bad2,
        evergreen: 0x173f45,
      }),
    ],
  },
  6: {
    id: 6,
    name: "Ironpine Basin",
    enemies: createStandardEnemyPlan("ironbark-hornet"),
    environment: {
      atmosphere: true,
      wispyClouds: true,
      horizon: 0xb5c9c5,
      zenith: 0x6b93aa,
      upperSky: 0x9db9c3,
      sunset: 0xffd29b,
      sunDirection: [-0.54, 0.38, 0.75],
      sunColor: 0xffe0ae,
      sunIntensity: 2.4,
      hemisphereSky: 0xd7e8e3,
      hemisphereGround: 0x34472f,
      hemisphereIntensity: 2.15,
      skySunIntensity: 0.78,
      exposure: 0.96,
    },
    systems: [
      borealForest({
        ground: [0x425426, 0x74883e, 0x9aa052],
        evergreen: [0x163b32, 0x235343, 0x376c4c],
        granite: [0x3d4a5c, 0x667387, 0x929eaa],
        water: 0x2e8f97,
        earth: 0x4a3424,
      }),
    ],
  },
};

export const LEVEL_IDS = Object.keys(LEVELS).map(Number) as LevelId[];
