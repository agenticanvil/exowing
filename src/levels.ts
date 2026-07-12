import { islandField } from './world/islandSystem';
import { oceanSurface } from './world/waterSystem';
import { desertCanyon } from './world/desertCanyonSystem';
import { asteroidBelt } from './world/asteroidBeltSystem';
import type { LevelEnvironment, WorldSystemDefinition } from './world/worldSystem';

export type LevelId = 1 | 2 | 3 | 4;

export type LevelDefinition = {
  id: LevelId;
  name: string;
  environment: LevelEnvironment;
  systems: readonly WorldSystemDefinition[];
};

export const LEVELS: Record<LevelId, LevelDefinition> = {
  1: {
    id: 1,
    name: 'Azure Reach',
    environment: {
      atmosphere: true,
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
      oceanSurface({ deep: 0x03445d, face: 0x008f95, horizon: 0x25bdb5, foam: 0xe8fff8 }),
      islandField({ style: 'weathered', color: 0x8b714d }),
    ],
  },
  2: {
    id: 2,
    name: 'Tempest Shards',
    environment: {
      atmosphere: true,
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
      oceanSurface({ deep: 0x020d18, face: 0x0a2c3b, horizon: 0x174753, foam: 0x78c5c7 }),
      islandField({ style: 'spires', color: 0x172329 }),
    ],
  },
  3: {
    id: 3,
    name: 'Sunscar Canyon',
    environment: {
      atmosphere: true,
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
    systems: [desertCanyon({ sand: 0xc9823f, rock: [0x9a4027, 0xc45f31, 0xe18443] })],
  },
  4: {
    id: 4,
    name: 'Umbra Belt',
    environment: {
      atmosphere: false,
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
    systems: [asteroidBelt({ rock: [0x414555, 0x676370, 0x8a6552], dust: 0x77d9df })],
  },
};

export const LEVEL_IDS = Object.keys(LEVELS).map(Number) as LevelId[];
