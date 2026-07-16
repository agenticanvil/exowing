import { describe, expect, it } from "vitest";
import type { LevelEnemyPlan } from "../enemies";
import {
  createLevelStats,
  recordLevelStep,
  summarizeLevelStats,
} from "./levelStats";

const plan: LevelEnemyPlan = {
  waves: [
    {
      spawnAtRailDistance: 0,
      enemyRailDistance: 100,
      groups: [
        {
          enemy: "riftspike",
          formation: [
            [0, 2],
            [2, 2],
            [-2, 2],
          ],
        },
      ],
    },
    {
      spawnAtRailDistance: 200,
      enemyRailDistance: 300,
      groups: [{ enemy: "riftmaw", formation: [[0, 5]] }],
    },
  ],
};

describe("level stats", () => {
  it("accumulates simulation results and summarizes the completed level", () => {
    const stats = createLevelStats(1_000);
    recordLevelStep(
      stats,
      {
        shotsFired: 5,
        enemyHits: 3,
        kills: 2,
        scoreDelta: 200,
        playerHits: 1,
        bossDefeated: false,
        levelComplete: false,
      },
      0.5,
      1.5,
    );
    recordLevelStep(
      stats,
      {
        shotsFired: 3,
        enemyHits: 2,
        kills: 1,
        scoreDelta: 2_500,
        playerHits: 0,
        bossDefeated: true,
        levelComplete: true,
      },
      0.25,
    );

    expect(summarizeLevelStats(stats, plan, 3_700)).toMatchObject({
      enemiesKilled: 3,
      totalEnemies: 4,
      killPercent: 75,
      shotsFired: 8,
      enemyHits: 5,
      accuracyPercent: 63,
      damageTaken: 1.5,
      elapsedSeconds: 0.75,
      scoreEarned: 2_700,
    });
  });

  it("reports zero accuracy when no shots were fired", () => {
    expect(
      summarizeLevelStats(createLevelStats(), plan, 0).accuracyPercent,
    ).toBe(0);
  });
});
