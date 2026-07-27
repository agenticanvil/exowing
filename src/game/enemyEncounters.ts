import {
  ENEMIES,
  type EnemyGroupDefinition,
  type LevelEnemyPlan,
  type StandardEnemyId,
} from "../enemies";
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

export const ENCOUNTER_FORMATIONS = {
  line4: [
    [-7, 4],
    [-2.5, 6],
    [2.5, 6],
    [7, 4],
  ],
  wedge5: STANDARD_FORMATION,
  cross5: [
    [-7, 4],
    [-3.5, 7],
    [0, 4],
    [3.5, 7],
    [7, 4],
  ],
  flank6: [
    [-9, 3],
    [-6, 7],
    [-2, 5],
    [2, 5],
    [6, 7],
    [9, 3],
  ],
  swarm7: [
    [-10, 4],
    [-7, 7],
    [-3.5, 5],
    [0, 8],
    [3.5, 5],
    [7, 7],
    [10, 4],
  ],
} as const;

export type AuthoredEncounterBeat = {
  groups: readonly EnemyGroupDefinition[];
  durationSeconds?: number;
  spawnDelaySeconds?: number;
};

export function createAuthoredEnemyPlan(
  beats: readonly AuthoredEncounterBeat[],
): LevelEnemyPlan {
  const waves = beats.map((beat, index) => ({
    spawnAtRailDistance: 0,
    enemyRailDistance: 108,
    enemyDistanceAhead: 108,
    durationSeconds: beat.durationSeconds ?? 24,
    spawnDelaySeconds: index === 0 ? 0 : (beat.spawnDelaySeconds ?? 5),
    requiresPreviousWaveResolved: index > 0,
    groups: beat.groups,
  }));
  return {
    waves: [
      ...waves,
      {
        spawnAtRailDistance: 0,
        enemyRailDistance: 82,
        enemyDistanceAhead: 82,
        spawnDelaySeconds: 5,
        requiresPreviousWaveResolved: beats.length > 0,
        groups: [{ enemy: "riftmaw", formation: [[0, 7]] }],
      },
    ],
  };
}

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
