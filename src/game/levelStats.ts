import type { LevelEnemyPlan } from "../enemies";
import type { FlightStepResult } from "../sim/types";

export type LevelStats = {
  enemiesKilled: number;
  shotsFired: number;
  enemyHits: number;
  damageTaken: number;
  elapsedSeconds: number;
  startingScore: number;
};

export type LevelStatsSummary = LevelStats & {
  totalEnemies: number;
  killPercent: number;
  accuracyPercent: number;
  scoreEarned: number;
};

export function createLevelStats(startingScore = 0): LevelStats {
  return {
    enemiesKilled: 0,
    shotsFired: 0,
    enemyHits: 0,
    damageTaken: 0,
    elapsedSeconds: 0,
    startingScore,
  };
}

export function recordLevelStep(
  stats: LevelStats,
  result: FlightStepResult,
  elapsedSeconds: number,
  damageTaken = result.playerHits,
) {
  stats.enemiesKilled += result.kills;
  stats.shotsFired += result.shotsFired;
  stats.enemyHits += result.enemyHits;
  stats.damageTaken += damageTaken;
  stats.elapsedSeconds += elapsedSeconds;
}

export function summarizeLevelStats(
  stats: LevelStats,
  plan: LevelEnemyPlan,
  finalScore: number,
): LevelStatsSummary {
  const totalEnemies = plan.waves.reduce(
    (waveTotal, wave) =>
      waveTotal +
      wave.groups.reduce(
        (groupTotal, group) => groupTotal + group.formation.length,
        0,
      ),
    0,
  );
  return {
    ...stats,
    totalEnemies,
    killPercent: totalEnemies
      ? Math.round((stats.enemiesKilled / totalEnemies) * 100)
      : 100,
    accuracyPercent: stats.shotsFired
      ? Math.round((stats.enemyHits / stats.shotsFired) * 100)
      : 0,
    scoreEarned: finalScore - stats.startingScore,
  };
}
