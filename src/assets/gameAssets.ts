import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LevelId } from '../levels';

export type GameAssets = {
  createPlayer: () => THREE.Group;
  createEnemy: () => THREE.Mesh;
  createGuardian: () => THREE.Mesh;
};

export type AssetLoadProgress = {
  loaded: number;
  total: number;
  label: string;
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

const playerPlane: ModelAsset = {
  key: 'player/plane-1',
  label: 'Player aircraft',
  modelUrl: new URL('../../assets/player/plane-1/plane-1.glb', import.meta.url).href,
  sidecarUrl: new URL('../../assets/player/plane-1/plane-1.asset.json', import.meta.url).href,
};

const riftspikeUrl = new URL(
  '../../assets/enemies/riftspike/riftspike.glb',
  import.meta.url,
).href;
const riftmawUrl = new URL(
  '../../assets/enemies/riftmaw/riftmaw.glb',
  import.meta.url,
).href;

// Keep level-only models here. The loader already treats each level as its own
// bundle, so later levels can load and release different content independently.
const levelModels: Record<LevelId, readonly ModelAsset[]> = {
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
};

const modelCache = new Map<string, Promise<LoadedModel>>();
let riftspikeCache: Promise<THREE.Mesh> | undefined;
let riftmawCache: Promise<THREE.Mesh> | undefined;

export async function loadGameAssets(
  levelId: LevelId,
  onProgress?: (progress: AssetLoadProgress) => void,
): Promise<GameAssets> {
  const models = [playerPlane, ...levelModels[levelId]];
  const totalAssets = models.length + 2;
  const loaded = new Map<string, LoadedModel>();

  for (let index = 0; index < models.length; index++) {
    const model = models[index];
    onProgress?.({ loaded: index, total: totalAssets, label: `Loading ${model.label}…` });
    loaded.set(model.key, await loadModel(model));
    onProgress?.({ loaded: index + 1, total: totalAssets, label: `${model.label} ready` });
  }

  const player = loaded.get(playerPlane.key);
  if (!player) throw new Error('The player aircraft did not load.');

  onProgress?.({ loaded: models.length, total: totalAssets, label: 'Loading Riftspike…' });
  const riftspike = await loadRiftspike();
  onProgress?.({ loaded: models.length + 1, total: totalAssets, label: 'Riftspike ready' });
  onProgress?.({ loaded: models.length + 1, total: totalAssets, label: 'Loading Riftmaw…' });
  const riftmaw = await loadRiftmaw();
  onProgress?.({ loaded: totalAssets, total: totalAssets, label: 'Riftmaw ready' });

  return {
    createPlayer: () => createPlayerInstance(player),
    createEnemy: () => createMeshInstance(riftspike),
    createGuardian: () => createMeshInstance(riftmaw),
  };
}

function loadRiftspike(): Promise<THREE.Mesh> {
  if (riftspikeCache) return riftspikeCache;
  riftspikeCache = new GLTFLoader().loadAsync(riftspikeUrl).then((gltf) => {
    let mesh: THREE.Mesh | undefined;
    gltf.scene.traverse((object) => {
      if (!mesh && object instanceof THREE.Mesh) mesh = object;
    });
    if (!mesh) throw new Error('The Riftspike GLB contains no mesh.');
    return mesh;
  }).catch((error: unknown) => {
    riftspikeCache = undefined;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load Riftspike: ${detail}`);
  });
  return riftspikeCache;
}

function loadRiftmaw(): Promise<THREE.Mesh> {
  if (riftmawCache) return riftmawCache;
  riftmawCache = new GLTFLoader().loadAsync(riftmawUrl).then((gltf) => {
    let mesh: THREE.Mesh | undefined;
    gltf.scene.traverse((object) => {
      if (!mesh && object instanceof THREE.Mesh) mesh = object;
    });
    if (!mesh) throw new Error('The Riftmaw GLB contains no mesh.');
    return mesh;
  }).catch((error: unknown) => {
    riftmawCache = undefined;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load Riftmaw: ${detail}`);
  });
  return riftmawCache;
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

  // Runtime movement is applied to this outer node. The sidecar transform stays
  // on the model node and is therefore not overwritten by the flight loop.
  const root = new THREE.Group();
  root.add(model);
  return root;
}
