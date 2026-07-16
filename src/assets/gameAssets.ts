import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ENEMIES, enemyIdsForPlan, type EnemyId } from '../enemies';
import { LEVELS, type LevelId } from '../levels';

export type GameAssets = {
  createPlayer: (modelId?: PlayerModelId) => THREE.Group;
  createEnemy: (enemyId: EnemyId) => THREE.Mesh;
};

export const PLAYER_MODEL_IDS = ['plane-1', 'plane-3'] as const;
export type PlayerModelId = (typeof PLAYER_MODEL_IDS)[number];

export const PLAYER_EFFECT_SOCKETS = [
  { name: 'socketexhaustleft', position: [-1.18, 0.47, 2.56] },
  { name: 'socketexhaustcenter', position: [0, 0.54, 2.62] },
  { name: 'socketexhaustright', position: [1.18, 0.47, 2.56] },
  { name: 'socketwingtip-vortexleft', position: [-4.78, 0.34, 0.24] },
  { name: 'socketwingtip-vortexright', position: [4.78, 0.34, 0.24] },
] as const;

export type AssetLoadProgress = {
  loaded: number;
  total: number;
};

type ModelAsset = {
  key: string;
  label: string;
  modelUrl: string;
  sidecarUrl: string;
};

type AssetTransform = {
  position: [number, number, number];
  rotationDegrees: [number, number, number];
  scale: number;
};

type AssetSidecar = {
  model: {
    file: string;
    transform: AssetTransform;
  };
};

type LoadedModel = {
  scene: THREE.Group;
  transform: AssetTransform;
};

const playerPlanes: Record<PlayerModelId, ModelAsset> = {
  'plane-1': {
    key: 'player/plane-1',
    label: 'Player aircraft 1',
    modelUrl: new URL('../../assets/player/plane-1/plane-1.glb', import.meta.url).href,
    sidecarUrl: new URL('../../assets/player/plane-1/plane-1.asset.json', import.meta.url).href,
  },
  'plane-3': {
    key: 'player/plane-3',
    label: 'Player aircraft 3',
    modelUrl: new URL('../../assets/player/plane-3/plane-3.glb', import.meta.url).href,
    sidecarUrl: new URL('../../assets/player/plane-3/plane-3.asset.json', import.meta.url).href,
  },
};

// Keep level-only models here. The loader already treats each level as its own
// bundle, so later levels can load and release different content independently.
const levelModels: Record<LevelId, readonly ModelAsset[]> = {
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
};

const modelCache = new Map<string, Promise<LoadedModel>>();
const enemyCache = new Map<EnemyId, Promise<THREE.Mesh>>();

export async function loadGameAssets(
  levelId: LevelId,
  onProgress?: (progress: AssetLoadProgress) => void,
): Promise<GameAssets> {
  const models = [...Object.values(playerPlanes), ...levelModels[levelId]];
  const enemyIds = enemyIdsForPlan(LEVELS[levelId].enemies);
  const totalAssets = models.length + enemyIds.length;
  const loaded = new Map<string, LoadedModel>();
  const loadedEnemies = new Map<EnemyId, THREE.Mesh>();

  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    onProgress?.({ loaded: index, total: totalAssets });
    loaded.set(model.key, await loadModel(model));
    onProgress?.({ loaded: index + 1, total: totalAssets });
  }

  for (const modelId of PLAYER_MODEL_IDS)
    if (!loaded.has(playerPlanes[modelId].key))
      throw new Error(`Player aircraft ${modelId} did not load.`);

  for (let index = 0; index < enemyIds.length; index++) {
    const enemyId = enemyIds[index];
    onProgress?.({
      loaded: models.length + index,
      total: totalAssets,
    });
    loadedEnemies.set(enemyId, await loadEnemy(enemyId));
    onProgress?.({
      loaded: models.length + index + 1,
      total: totalAssets,
    });
  }

  return {
    createPlayer: (modelId = 'plane-1') => {
      const player = loaded.get(playerPlanes[modelId].key);
      if (!player) throw new Error(`Player aircraft ${modelId} is unavailable.`);
      return createPlayerInstance(player);
    },
    createEnemy: (enemyId) => {
      const enemy = loadedEnemies.get(enemyId);
      if (!enemy) throw new Error(`${ENEMIES[enemyId].label} is unavailable.`);
      return createMeshInstance(enemy);
    },
  };
}

function loadEnemy(enemyId: EnemyId): Promise<THREE.Mesh> {
  const cached = enemyCache.get(enemyId);
  if (cached) return cached;
  const enemy = ENEMIES[enemyId];
  const promise = new GLTFLoader().loadAsync(enemy.modelUrl).then((gltf) => {
    let mesh: THREE.Mesh | undefined;
    gltf.scene.traverse((object) => {
      if (!mesh && object instanceof THREE.Mesh) mesh = object;
    });
    if (!mesh) throw new Error(`The ${enemy.label} GLB contains no mesh.`);
    return mesh;
  }).catch((error: unknown) => {
    enemyCache.delete(enemyId);
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load ${enemy.label}: ${detail}`);
  });
  enemyCache.set(enemyId, promise);
  return promise;
}

function createMeshInstance(source: THREE.Mesh): THREE.Mesh {
  return new THREE.Mesh(
    source.geometry.clone(),
    Array.isArray(source.material)
      ? source.material.map((material) => material.clone())
      : source.material.clone(),
  );
}

function loadModel(asset: ModelAsset): Promise<LoadedModel> {
  const cached = modelCache.get(asset.key);
  if (cached) return cached;

  const promise = Promise.all([
    new GLTFLoader().loadAsync(asset.modelUrl),
    loadSidecar(asset),
  ]).then(([gltf, sidecar]) => ({
    scene: gltf.scene,
    transform: sidecar.model.transform,
  })).catch((error: unknown) => {
      modelCache.delete(asset.key);
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not load ${asset.label}: ${detail}`);
    });
  modelCache.set(asset.key, promise);
  return promise;
}

async function loadSidecar(asset: ModelAsset): Promise<AssetSidecar> {
  const response = await fetch(asset.sidecarUrl);
  if (!response.ok) throw new Error(`Missing asset sidecar (${response.status})`);
  const sidecar = await response.json() as unknown;
  if (!isAssetSidecar(sidecar)) throw new Error('Invalid asset sidecar');
  return sidecar;
}

function isAssetSidecar(value: unknown): value is AssetSidecar {
  if (!value || typeof value !== 'object') return false;
  const model = (value as { model?: unknown }).model;
  if (!model || typeof model !== 'object') return false;
  const candidate = model as { file?: unknown; transform?: unknown };
  if (typeof candidate.file !== 'string' || !candidate.transform || typeof candidate.transform !== 'object') return false;
  const transform = candidate.transform as Partial<AssetTransform>;
  return isVector3(transform.position)
    && isVector3(transform.rotationDegrees)
    && typeof transform.scale === 'number'
    && Number.isFinite(transform.scale)
    && transform.scale > 0;
}

function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((component) => typeof component === 'number' && Number.isFinite(component));
}

function createPlayerInstance(asset: LoadedModel): THREE.Group {
  const model = asset.scene.clone(true);
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
  });

  const { position, rotationDegrees, scale } = asset.transform;
  model.position.fromArray(position);
  model.rotation.set(...rotationDegrees.map(THREE.MathUtils.degToRad) as [number, number, number]);
  model.scale.setScalar(scale);
  addMissingPlayerEffectSockets(model);

  // Runtime movement is applied to this outer node. The sidecar transform stays
  // on the model node and is therefore not overwritten by the flight loop.
  const root = new THREE.Group();
  root.add(model);
  return root;
}

export function addMissingPlayerEffectSockets(model: THREE.Object3D) {
  const existingNames = new Set<string>();
  model.traverse((object) => existingNames.add(normalizeName(object.name)));
  for (const definition of PLAYER_EFFECT_SOCKETS) {
    if (existingNames.has(normalizeName(definition.name))) continue;
    const socket = new THREE.Object3D();
    socket.name = definition.name;
    socket.position.set(
      definition.position[0],
      definition.position[1],
      definition.position[2],
    );
    model.add(socket);
  }
}

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
