import { describe, expect, it } from "vitest";
import { LEVELS, type LevelDefinition } from "./levels";

describe("level definitions", () => {
  it("allow environments without a surface or scenery systems", () => {
    const openSpace = {
      id: 1,
      name: "Open Space",
      enemies: { waves: [] },
      environment: {
        atmosphere: false,
        wispyClouds: false,
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

  it("defines the desert canyon without a water system", () => {
    const systems = LEVELS[3].systems.map((definition) => definition.create());

    expect(systems.map((system) => system.id)).toEqual(["desert-canyon"]);
  });

  it("defines the asteroid belt without a surface system", () => {
    const systems = LEVELS[4].systems.map((definition) => definition.create());

    expect(systems.map((system) => system.id)).toEqual(["asteroid-belt"]);
    expect(LEVELS[4].environment.atmosphere).toBe(false);
  });

  it("marks the terrestrial levels as atmospheric", () => {
    expect(
      [LEVELS[1], LEVELS[2], LEVELS[3], LEVELS[5], LEVELS[6]].every(
        (level) => level.environment.atmosphere,
      ),
    ).toBe(true);
  });

  it("lets each level control whether its sky has wispy clouds", () => {
    expect(
      [LEVELS[1], LEVELS[2], LEVELS[3], LEVELS[5], LEVELS[6]].every(
        (level) => level.environment.wispyClouds,
      ),
    ).toBe(true);
    expect(LEVELS[4].environment.wispyClouds).toBe(false);
  });

  it("adds restrained enemy fill only to the darker levels", () => {
    expect(LEVELS[2].environment.enemyFillIntensity).toBe(0.55);
    expect(LEVELS[4].environment.enemyFillIntensity).toBe(0.38);
    expect(
      [LEVELS[1], LEVELS[3], LEVELS[5], LEVELS[6]].every(
        (level) => level.environment.enemyFillIntensity === undefined,
      ),
    ).toBe(true);
  });

  it("defines the alpine snowfields as a dedicated terrestrial system", () => {
    const systems = LEVELS[5].systems.map((definition) => definition.create());

    expect(systems.map((system) => system.id)).toEqual(["alpine-snowfields"]);
    expect(LEVELS[5].environment.atmosphere).toBe(true);
  });

  it("defines the boreal forest as a dedicated terrestrial system", () => {
    const systems = LEVELS[6].systems.map((definition) => definition.create());

    expect(systems.map((system) => system.id)).toEqual(["boreal-forest"]);
    expect(LEVELS[6].environment.atmosphere).toBe(true);
  });

  it("assigns varied authored rosters and increasing enemy counts", () => {
    const rosters = Object.values(LEVELS).map(
      (level) =>
        new Set(
          level.enemies.waves
            .flatMap((wave) => wave.groups)
            .filter((group) => group.enemy !== "riftmaw")
            .map((group) => group.enemy),
        ),
    );
    expect(rosters).toEqual([
      new Set(["riftspike"]),
      new Set(["stormneedle-kite", "gloomjelly"]),
      new Set(["cinderback-bomber", "thornwing"]),
      new Set(["gravemill", "reefclaw-skimmer"]),
      new Set(["cryofin-ray", "tideglass-manta"]),
      new Set([
        "ironbark-hornet",
        "stormneedle-kite",
        "gloomjelly",
        "cinderback-bomber",
        "cryofin-ray",
      ]),
    ]);
    expect(
      Object.values(LEVELS).map((level) =>
        level.enemies.waves
          .slice(0, -1)
          .flatMap((wave) => wave.groups)
          .reduce((total, group) => total + group.formation.length, 0),
      ),
    ).toEqual([14, 18, 19, 20, 21, 24]);
  });
});
