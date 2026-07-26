import { describe, expect, it } from "vitest";
import type { LevelEnemyPlan } from "../enemies";
import {
  createStandardEnemyPlan,
  createTransitionTourPlan,
} from "./enemyEncounters";
import { RAIL_SPEED } from "../sim/railSystem";

describe("createTransitionTourPlan", () => {
  it("supports a different standard enemy for each formation", () => {
    const plan = createStandardEnemyPlan([
      "reefclaw-skimmer",
      "tideglass-manta",
    ]);

    expect(plan.waves[0].groups[0].enemy).toBe("reefclaw-skimmer");
    expect(plan.waves[1].groups[0].enemy).toBe("tideglass-manta");
    expect(plan.waves[2].groups[0].enemy).toBe("riftmaw");
  });

  it("gives both standard formations the same roughly 45-second window", () => {
    const plan = createStandardEnemyPlan("riftspike");
    const standardWaves = plan.waves.slice(0, 2);
    const windows = standardWaves.map(
      (wave) =>
        ((wave.exitAtRailDistance ?? 0) - wave.spawnAtRailDistance) /
        RAIL_SPEED,
    );
    const startingGaps = standardWaves.map(
      (wave) => wave.enemyRailDistance - wave.spawnAtRailDistance,
    );

    expect(windows[0]).toBeCloseTo(42.2);
    expect(windows[1]).toBeCloseTo(windows[0]);
    expect(startingGaps).toEqual([145, 145]);
  });

  it("keeps only the boss and moves it near the level start", () => {
    const plan = createTransitionTourPlan(createStandardEnemyPlan("riftspike"));

    expect(plan.waves).toHaveLength(1);
    expect(plan.waves[0]).toMatchObject({
      spawnAtRailDistance: 0,
      enemyRailDistance: 65,
    });
    expect(plan.waves[0].groups.map((group) => group.enemy)).toEqual([
      "riftmaw",
    ]);
    expect(plan.waves[0].groups[0].formation).toEqual([[0, 4]]);
  });

  it("uses the final wave when the level has no boss", () => {
    const plan: LevelEnemyPlan = {
      waves: [
        {
          spawnAtRailDistance: 0,
          enemyRailDistance: 100,
          groups: [{ enemy: "riftspike", formation: [[0, 4]] }],
        },
        {
          spawnAtRailDistance: 300,
          enemyRailDistance: 400,
          groups: [
            {
              enemy: "thornwing",
              formation: [
                [-2, 5],
                [2, 5],
              ],
            },
          ],
        },
      ],
    };

    const tour = createTransitionTourPlan(plan);

    expect(tour.waves).toHaveLength(1);
    expect(tour.waves[0].groups).toEqual([
      {
        enemy: "thornwing",
        formation: [
          [-2, 4],
          [2, 4],
        ],
      },
    ]);
  });
});
