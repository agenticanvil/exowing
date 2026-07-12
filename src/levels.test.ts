import { describe, expect, it } from 'vitest';
import type { LevelDefinition } from './levels';

describe('level definitions', () => {
  it('allow environments without a surface or scenery systems', () => {
    const openSpace = {
      id: 1,
      name: 'Open Space',
      environment: {
        horizon: 0x02030a,
        zenith: 0x000000,
        upperSky: 0x070b20,
        sunset: 0x342050,
        sunDirection: [0, 0.2, 1],
        sunColor: 0xffffff,
        sunIntensity: 1,
        hemisphereSky: 0x182040,
        hemisphereGround: 0x000000,
        hemisphereIntensity: 0.2,
        skySunIntensity: 0.5,
        exposure: 0.8,
      },
      systems: [],
    } satisfies LevelDefinition;

    expect(openSpace.systems).toEqual([]);
  });
});
