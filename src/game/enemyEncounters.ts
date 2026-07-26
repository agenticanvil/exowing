import { ENEMIES, type LevelEnemyPlan, type StandardEnemyId } from "../enemies";
import { SECTION_LENGTH, SECTION_SPAN } from "../sim/railSystem";

const WAVE_OFFSET = 145;
const ENEMY_SCATTER_LEAD = 42;

const STANDARD_FORMATION = [
  [-5, 5],
  [0, 7],
  [5, 5],
  [-2.5, 3],
  [2.5, 3],
] as const;

/** Reproduces the original two formations followed by the Riftmaw finale. */
export function createStandardEnemyPlan(
  standardEnemy: StandardEnemyId | readonly [StandardEnemyId, StandardEnemyId],
): LevelEnemyPlan {
  const [openingEnemy, reinforcementEnemy] =
    typeof standardEnemy === "string"
      ? [standardEnemy, standardEnemy]
      : standardEnemy;

  return {
    waves: [
      {
        spawnAtRailDistance: 0,
        enemyRailDistance: WAVE_OFFSET,
        exitAtRailDistance: SECTION_LENGTH - ENEMY_SCATTER_LEAD,
        groups: [{ enemy: openingEnemy, formation: STANDARD_FORMATION }],
      },
      {
        spawnAtRailDistance: SECTION_SPAN,
        enemyRailDistance: SECTION_SPAN + WAVE_OFFSET,
        exitAtRailDistance: SECTION_SPAN + SECTION_LENGTH - ENEMY_SCATTER_LEAD,
        groups: [{ enemy: reinforcementEnemy, formation: STANDARD_FORMATION }],
      },
      {
        spawnAtRailDistance: SECTION_SPAN * 2,
        enemyRailDistance: SECTION_SPAN * 2 + WAVE_OFFSET,
        requiresPreviousWaveResolved: true,
        groups: [{ enemy: "riftmaw", formation: [[0, 7]] }],
      },
    ],
  };
}

/** Places only the boss, or the final wave, close enough for a quick transition test. */
export function createTransitionTourPlan(plan: LevelEnemyPlan): LevelEnemyPlan {
  const bossWave = [...plan.waves]
    .reverse()
    .find((wave) =>
      wave.groups.some((group) => ENEMIES[group.enemy].kind === "boss"),
    );
  const bossGroups =
    bossWave?.groups.filter((group) => ENEMIES[group.enemy].kind === "boss") ??
    [];
  const fallbackGroups = plan.waves.at(-1)?.groups ?? [];
  const groups = bossGroups.length > 0 ? bossGroups : fallbackGroups;
  const firingLaneGroups = groups.map((group) => ({
    ...group,
    formation: group.formation.map(([x]) => [x, 4] as const),
  }));

  return {
    waves: [
      {
        spawnAtRailDistance: 0,
        enemyRailDistance: 65,
        groups: firingLaneGroups,
      },
    ],
  };
}
