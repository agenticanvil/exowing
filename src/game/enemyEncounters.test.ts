import { describe, expect, it } from "vitest";
import type { LevelEnemyPlan } from "../enemies";
import {
  createStandardEnemyPlan,
  createTransitionTourPlan,
} from "./enemyEncounters";

describe("createTransitionTourPlan", () => {
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
