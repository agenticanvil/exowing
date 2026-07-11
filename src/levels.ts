export type LevelId = 1 | 2;
export type IslandStyle = 'weathered' | 'spires';

export type LevelDefinition = {
  id: LevelId;
  name: string;
  environment: {
    horizon: number;
    zenith: number;
    upperSky: number;
    sunset: number;
    sunDirection: readonly [number, number, number];
    sunColor: number;
    sunIntensity: number;
    hemisphereSky: number;
    hemisphereGround: number;
    hemisphereIntensity: number;
    skySunIntensity: number;
    exposure: number;
    waterDeep: number;
    waterFace: number;
    waterHorizon: number;
    foam: number;
  };
  islands: {
    style: IslandStyle;
    color: number;
  };
};

export const LEVELS: Record<LevelId, LevelDefinition> = {
  1: {
    id: 1,
    name: 'Azure Reach',
    environment: {
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
      waterDeep: 0x052e60,
      waterFace: 0x047599,
      waterHorizon: 0x1a9eb8,
      foam: 0xe5fcf7,
    },
    islands: { style: 'weathered', color: 0x8b714d },
  },
  2: {
    id: 2,
    name: 'Tempest Shards',
    environment: {
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
      waterDeep: 0x020d18,
      waterFace: 0x0a2c3b,
      waterHorizon: 0x174753,
      foam: 0x78c5c7,
    },
    islands: { style: 'spires', color: 0x172329 },
  },
};
