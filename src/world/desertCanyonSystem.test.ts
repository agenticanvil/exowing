import { describe, expect, it } from 'vitest';
import { createMesaGeometry, desertCanyon, DesertCanyonSystem } from './desertCanyonSystem';

describe('DesertCanyonSystem', () => {
  it('streams scenery on both sides of the flight corridor', () => {
    const system = desertCanyon({ sand: 0xc9823f, rock: [0x9a4027, 0xc45f31, 0xe18443] }).create() as DesertCanyonSystem;
    let nextId = 1;

    system.step({ railDistance: 0, allocateId: () => nextId++ });

    expect(system.features.length).toBeGreaterThan(10);
    expect(system.features.some((feature) => feature.side === -1)).toBe(true);
    expect(system.features.some((feature) => feature.side === 1)).toBe(true);
    expect(system.features.every((feature) => feature.offset > 14)).toBe(true);
  });

  it('creates one continuous, deterministic faceted mesa mesh', () => {
    const options = {
      seed: 42, width: 20, depth: 16, height: 18, profile: 'weathered' as const,
      colors: [0x9a4027, 0xc45f31, 0xe18443] as const,
    };
    const first = createMesaGeometry(options);
    const second = createMesaGeometry(options);

    expect(first.index).toBeNull();
    expect(first.getAttribute('position').count).toBeGreaterThan(500);
    expect(first.getAttribute('color').count).toBe(first.getAttribute('position').count);
    expect(Array.from(first.getAttribute('position').array)).toEqual(Array.from(second.getAttribute('position').array));

    first.dispose();
    second.dispose();
  });
});
