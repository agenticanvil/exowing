import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { LevelDefinition } from "../levels";
import { FLIGHT_WINDOW, type FlightSimulation } from "../sim/flightSimulation";
import { railFrameAtDistance, railOffsetPosition } from "../sim/railSystem";
import { SkyView } from "./skyView";
import type { WorldRuntime } from "../world/worldSystem";
import {
  PLAYER_MODEL_IDS,
  type GameAssets,
  type PlayerModelId,
} from "../assets/gameAssets";
import { JetExhaustView } from "./jetExhaustView";
import { WingtipVortexView } from "./wingtipVortexView";
import type { Vec3 } from "../sim/types";
import {
  FLIGHT_FOG_FAR_DISTANCE,
  FLIGHT_FOG_NEAR_DISTANCE,
} from "../game/flightDistances";
import { EnemyDestructionView } from "./enemyDestructionView";

const TURN_BANK = THREE.MathUtils.degToRad(20);
const INPUT_BANK = THREE.MathUtils.degToRad(6);
const PITCH_PER_VERTICAL_SPEED = 0.016;
const PITCH_LEVELING_DISTANCE = 2;
const BANK_SAMPLE_DISTANCE = 14;
const FULL_TURN_HEADING_DELTA = THREE.MathUtils.degToRad(10.5);
const PROJECTILE_AXIS = new THREE.Vector3(0, 1, 0);
const projectileDirection = new THREE.Vector3();
const PLAYER_SHOT_COLOR = 0x35f2ff;
const ENEMY_SHOT_COLOR = 0xff3b32;
const RETICLE_COLOR = 0x3df8ff;
const RETICLE_NEAR_DISTANCE = 18;
const RETICLE_FAR_DISTANCE = 46;
// Riftmaw is 13.4 units across. This produces a 7.25-unit span, just above the
// previous scaled guardian's 6.91-unit maximum extent.
const RIFTMAW_SCALE = 7.25 / 13.4;

export class GameView {
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
  private readonly composer: EffectComposer;
  private readonly fxaaPass = new FXAAPass();
  private readonly ship = new THREE.Group();
  private readonly playerModels = new Map<PlayerModelId, THREE.Group>();
  private jetExhaust: JetExhaustView;
  private wingtipVortices?: WingtipVortexView;
  private activePlayerModelId: PlayerModelId = "plane-1";
  private readonly hasAtmosphere: boolean;
  private readonly enemies: THREE.InstancedMesh;
  private readonly enemyHit: THREE.InstancedBufferAttribute;
  private readonly enemyBaseRadius: number;
  private readonly guardian: THREE.InstancedMesh;
  private readonly guardianHit: THREE.InstancedBufferAttribute;
  private readonly enemyDestructions: EnemyDestructionView;
  private readonly projectileViews = new Map<number, THREE.Group>();
  private readonly shotCoreGeometry = createBoltGeometry(0.085, 2.35, 12);
  private readonly shotGlowGeometry = createBoltGeometry(0.19, 2.9, 12);
  private readonly sky: SkyView;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly flightWindowGuide: THREE.Line;
  private readonly splineGuide: THREE.Line;
  private readonly reticle: ReturnType<typeof createReticle>;
  private readonly sunDirection: THREE.Vector3;
  private renderScale = 1;
  private previousRenderTime = performance.now() * 0.001;

  constructor(
    container: HTMLElement,
    level: LevelDefinition,
    private readonly world: WorldRuntime,
    assets?: GameAssets,
  ) {
    const environment = level.environment;
    this.hasAtmosphere = environment.atmosphere;
    this.sunDirection = new THREE.Vector3(
      ...environment.sunDirection,
    ).normalize();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = environment.exposure;
    container.append(this.renderer.domElement);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(innerWidth, innerHeight),
        0.68,
        0.22,
        2,
      ),
    );
    this.composer.addPass(this.fxaaPass);
    this.composer.addPass(new OutputPass());
    const horizonColor = new THREE.Color(environment.horizon);
    this.scene.background = horizonColor;
    this.scene.fog = new THREE.Fog(
      horizonColor,
      FLIGHT_FOG_NEAR_DISTANCE,
      FLIGHT_FOG_FAR_DISTANCE,
    );

    this.scene.add(
      new THREE.HemisphereLight(
        environment.hemisphereSky,
        environment.hemisphereGround,
        environment.hemisphereIntensity,
      ),
    );
    this.sunLight = new THREE.DirectionalLight(
      environment.sunColor,
      environment.sunIntensity,
    );
    this.scene.add(this.sunLight, this.sunLight.target);

    this.sky = new SkyView(level);
    this.scene.add(this.sky.mesh);

    this.world.attach(this.scene, environment);

    for (const modelId of PLAYER_MODEL_IDS)
      if (assets) this.playerModels.set(modelId, assets.createPlayer(modelId));
    if (!assets) this.playerModels.set("plane-1", createPlaceholderShip());
    const initialPlayer = this.playerModels.get(this.activePlayerModelId);
    if (!initialPlayer)
      throw new Error("The default player model is unavailable.");
    this.ship.add(initialPlayer);
    this.jetExhaust = new JetExhaustView(initialPlayer);
    this.scene.add(this.ship);
    const enemySource = assets?.createEnemy() ?? createPlaceholderEnemy();
    if (Array.isArray(enemySource.material))
      throw new Error("The Riftspike must use a single merged material.");
    const enemyDestructionMaterial = enemySource.material.clone();
    addInstancedHitFlash(enemySource.material);
    enemySource.geometry.computeBoundingSphere();
    this.enemyBaseRadius = enemySource.geometry.boundingSphere?.radius ?? 1;
    this.enemyHit = new THREE.InstancedBufferAttribute(
      new Float32Array(256),
      1,
    );
    enemySource.geometry.setAttribute("instanceHit", this.enemyHit);
    this.enemies = new THREE.InstancedMesh(
      enemySource.geometry,
      enemySource.material,
      256,
    );
    this.enemies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.enemies.count = 0;
    this.scene.add(this.enemies);
    const guardianSource = assets?.createGuardian() ?? createPlaceholderEnemy();
    if (Array.isArray(guardianSource.material))
      throw new Error("Riftmaw must use a single merged material.");
    const guardianDestructionMaterial = guardianSource.material.clone();
    addInstancedHitFlash(guardianSource.material, "riftmaw");
    this.guardianHit = new THREE.InstancedBufferAttribute(
      new Float32Array(1),
      1,
    );
    guardianSource.geometry.setAttribute("instanceHit", this.guardianHit);
    this.guardian = new THREE.InstancedMesh(
      guardianSource.geometry,
      guardianSource.material,
      1,
    );
    this.guardian.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.guardian.count = 0;
    this.scene.add(this.guardian);
    this.enemyDestructions = new EnemyDestructionView(this.scene, {
      standard: {
        geometry: enemySource.geometry,
        material: enemyDestructionMaterial,
        baseRadius: this.enemyBaseRadius,
        fragmentCount: 8,
      },
      boss: {
        geometry: guardianSource.geometry,
        material: guardianDestructionMaterial,
        baseRadius: 3.5 / RIFTMAW_SCALE,
        fragmentCount: 12,
      },
    });
    enemyDestructionMaterial.dispose();
    guardianDestructionMaterial.dispose();
    if (this.hasAtmosphere)
      this.wingtipVortices = new WingtipVortexView(this.scene, initialPlayer);

    this.flightWindowGuide = addFlightWindow(this.scene);
    this.flightWindowGuide.visible = false;
    this.splineGuide = addSplineGuide(this.scene);
    this.reticle = createReticle();
    this.scene.add(this.reticle.group);
    window.addEventListener("resize", this.resize);
    this.resize();
  }

  sync(sim: FlightSimulation) {
    const renderTime = performance.now() * 0.001;
    const renderDt = renderTime - this.previousRenderTime;
    this.jetExhaust.update(sim.railSpeed, renderDt);
    this.previousRenderTime = renderTime;
    const rail = railFrameAtDistance(sim.railDistance);
    const shipPosition = railOffsetPosition(
      sim.railDistance,
      sim.player.offsetX,
      sim.player.offsetY,
    );
    this.ship.position.set(shipPosition.x, shipPosition.y, shipPosition.z);
    this.ship.rotation.y = -rail.heading;
    const turnBank = splineTurnStrength(sim.railDistance) * TURN_BANK;
    const inputBank = (sim.player.velocityX / 12) * INPUT_BANK;
    const barrelRoll =
      sim.player.rollDirection * sim.player.rollProgress * Math.PI * 2;
    this.ship.rotation.z = turnBank + inputBank + barrelRoll;
    this.ship.rotation.x = playerPitch(
      sim.player.offsetY,
      sim.player.velocityY,
    );
    this.ship.updateMatrixWorld(true);
    this.wingtipVortices?.update(sim.railSpeed, renderDt);
    syncEnemyInstances(
      this.enemies,
      this.enemyHit,
      sim.enemies.filter((enemy) => enemy.kind !== "boss"),
      this.enemyBaseRadius,
      shipPosition,
    );
    this.enemyDestructions.sync(
      sim.enemyDestructions,
      shipPosition,
      Math.min(renderDt, 0.1),
    );
    syncEnemyInstances(
      this.guardian,
      this.guardianHit,
      sim.enemies.filter((enemy) => enemy.kind === "boss"),
      3.5 / RIFTMAW_SCALE,
      shipPosition,
    );
    syncProjectiles(
      this.scene,
      this.projectileViews,
      sim.projectiles,
      this.shotCoreGeometry,
      this.shotGlowGeometry,
    );
    const windowCenterY = (FLIGHT_WINDOW.minY + FLIGHT_WINDOW.maxY) / 2;
    const cameraDistance = distanceToFrameFlightWindow(this.camera);
    const railCenter = railOffsetPosition(sim.railDistance, 0, windowCenterY);
    this.camera.position.set(
      railCenter.x - rail.forward.x * cameraDistance,
      railCenter.y,
      railCenter.z - rail.forward.z * cameraDistance,
    );
    this.camera.lookAt(railCenter.x, railCenter.y, railCenter.z);
    const firingOrigin = railOffsetPosition(
      sim.railDistance + 2,
      sim.player.offsetX,
      sim.player.offsetY,
    );
    const firingDirection = { x: rail.forward.x, y: 0, z: rail.forward.z };
    syncReticle(this.reticle, firingOrigin, firingDirection);
    this.sky.update(this.camera.position, renderTime);
    this.sunLight.target.position.set(railCenter.x, railCenter.y, railCenter.z);
    this.sunLight.position
      .copy(this.sunLight.target.position)
      .addScaledVector(this.sunDirection, 120);
    this.world.render(rail.position.x, rail.position.z, renderTime);
    this.flightWindowGuide.position.set(rail.position.x, 0, rail.position.z);
    this.flightWindowGuide.rotation.y = Math.PI - rail.heading;
    if (this.splineGuide.visible)
      updateSplineGuide(this.splineGuide, sim.railDistance);
    this.composer.render();
  }

  setDebugVisibility(showMovementFrame: boolean, showSpline: boolean) {
    this.flightWindowGuide.visible = showMovementFrame;
    this.splineGuide.visible = showSpline;
  }

  setRenderScale(scale: number) {
    this.renderScale = scale;
    this.resize();
  }

  setAntiAliasing(enabled: boolean) {
    this.fxaaPass.enabled = enabled;
  }

  setReticleVisible(visible: boolean) {
    this.reticle.group.visible = visible;
  }

  setPlayerModel(modelId: PlayerModelId) {
    if (modelId === this.activePlayerModelId) return;
    const model = this.playerModels.get(modelId);
    if (!model) return;

    this.jetExhaust.dispose();
    this.wingtipVortices?.dispose();
    this.ship.clear();
    this.ship.add(model);
    this.jetExhaust = new JetExhaustView(model);
    this.wingtipVortices = this.hasAtmosphere
      ? new WingtipVortexView(this.scene, model)
      : undefined;
    this.activePlayerModelId = modelId;
  }

  getRenderResolution() {
    return {
      width: Math.round(
        innerWidth * Math.min(devicePixelRatio, 2) * this.renderScale,
      ),
      height: Math.round(
        innerHeight * Math.min(devicePixelRatio, 2) * this.renderScale,
      ),
    };
  }

  dispose() {
    window.removeEventListener("resize", this.resize);
    this.world.dispose();
    this.jetExhaust.dispose();
    this.wingtipVortices?.dispose();
    this.enemyDestructions.dispose();
    for (const model of this.playerModels.values()) disposeObject(model);
    this.ship.removeFromParent();
    for (const group of this.projectileViews.values())
      disposeObject(group, false);
    disposeObject(this.enemies);
    disposeObject(this.guardian);
    this.shotCoreGeometry.dispose();
    this.shotGlowGeometry.dispose();
    this.sky.dispose();
    disposeObject(this.flightWindowGuide);
    disposeObject(this.splineGuide);
    disposeReticle(this.reticle);
    this.composer.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.projectileViews.clear();
  }

  private resize = () => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, 2) * this.renderScale,
    );
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  };
}

function createReticle() {
  const textures = [createNearReticleTexture(), createFarReticleTexture()];
  const group = new THREE.Group();
  const near = createReticleMarker(textures[0], 3, 0.76);
  const far = createReticleMarker(textures[1], 3.85, 0.84);
  near.renderOrder = 1000;
  far.renderOrder = 999;
  group.add(near, far);
  return { group, markers: [near, far] as const, textures };
}

function createReticleMarker(
  texture: THREE.Texture,
  size: number,
  opacity: number,
) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: new THREE.Color(RETICLE_COLOR).multiplyScalar(1.3),
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const marker = new THREE.Sprite(material);
  marker.scale.setScalar(size);
  return marker;
}

function createNearReticleTexture() {
  return createReticleTexture((context) => {
    const outer = 78;
    const inner = 42;
    for (const [horizontal, vertical] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      context.beginPath();
      context.moveTo(horizontal * inner, vertical * outer);
      context.lineTo(horizontal * outer, vertical * outer);
      context.lineTo(horizontal * outer, vertical * inner);
      context.stroke();
    }
  });
}

function createFarReticleTexture() {
  return createReticleTexture((context) => {
    for (let quadrant = 0; quadrant < 4; quadrant++) {
      const start = quadrant * (Math.PI / 2) + 0.22;
      const end = start + Math.PI / 2 - 0.54;
      context.beginPath();
      context.arc(0, 0, 68, start, end);
      context.stroke();
    }
    context.lineWidth = 6;
    for (const [x, y] of [
      [0, -96],
      [96, 0],
      [0, 96],
      [-96, 0],
    ]) {
      context.beginPath();
      context.moveTo(x - (x === 0 ? 0 : Math.sign(x) * 12), y);
      context.lineTo(x + (x === 0 ? 0 : Math.sign(x) * 4), y);
      context.moveTo(x, y - (y === 0 ? 0 : Math.sign(y) * 12));
      context.lineTo(x, y + (y === 0 ? 0 : Math.sign(y) * 4));
      context.stroke();
    }
  });
}

function createReticleTexture(
  draw: (context: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create targeting reticle.");
  context.translate(128, 128);
  context.strokeStyle = "white";
  context.lineCap = "square";
  context.lineJoin = "miter";
  context.lineWidth = 7;
  context.shadowColor = "white";
  context.shadowBlur = 7;
  draw(context);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function syncReticle(
  reticle: ReturnType<typeof createReticle>,
  origin: Vec3,
  direction: Vec3,
) {
  const distances = [RETICLE_NEAR_DISTANCE, RETICLE_FAR_DISTANCE];
  for (let index = 0; index < reticle.markers.length; index++) {
    const marker = reticle.markers[index];
    const distance = distances[index];
    marker.position.set(
      origin.x + direction.x * distance,
      origin.y + direction.y * distance,
      origin.z + direction.z * distance,
    );
  }
}

function disposeReticle(reticle: ReturnType<typeof createReticle>) {
  reticle.group.removeFromParent();
  for (const marker of reticle.markers) marker.material.dispose();
  for (const texture of reticle.textures) texture.dispose();
}

function disposeObject(root: THREE.Object3D, disposeGeometry = true) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
    if (disposeGeometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of objectMaterials) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  root.removeFromParent();
}

export function playerPitch(offsetY: number, velocityY: number) {
  if (velocityY === 0) return 0;
  const distanceToEdge =
    velocityY > 0 ? FLIGHT_WINDOW.maxY - offsetY : offsetY - FLIGHT_WINDOW.minY;
  const levelingProgress = THREE.MathUtils.clamp(
    distanceToEdge / PITCH_LEVELING_DISTANCE,
    0,
    1,
  );
  const easedPitchScale = THREE.MathUtils.smoothstep(levelingProgress, 0, 1);
  if (easedPitchScale === 0) return 0;
  return -velocityY * PITCH_PER_VERTICAL_SPEED * easedPitchScale;
}

function createPlaceholderShip(): THREE.Group {
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.35);
  shape.lineTo(-1.15, -1.05);
  shape.lineTo(0, -0.55);
  shape.lineTo(1.15, -1.05);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.42,
    bevelEnabled: false,
  });
  geometry.center();
  geometry.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xf2f5f7, roughness: 0.5 }),
  );
  mesh.scale.setScalar(1.15);
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

function createPlaceholderEnemy() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(1.25, 16, 10),
    new THREE.MeshStandardMaterial({ color: 0xf04453, roughness: 0.65 }),
  );
}

function syncProjectiles(
  scene: THREE.Scene,
  views: Map<number, THREE.Group>,
  states: FlightSimulation["projectiles"],
  coreGeometry: THREE.BufferGeometry,
  glowGeometry: THREE.BufferGeometry,
) {
  const live = new Set(states.map((state) => state.id));
  for (const [id, group] of views)
    if (!live.has(id)) {
      scene.remove(group);
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) material.dispose();
        }
      });
      views.delete(id);
    }
  for (const state of states) {
    let group = views.get(state.id);
    if (!group) {
      group = createProjectileView(state.owner, coreGeometry, glowGeometry);
      views.set(state.id, group);
      scene.add(group);
    }
    group.position.set(state.position.x, state.position.y, state.position.z);
    projectileDirection
      .set(state.velocity.x, state.velocity.y, state.velocity.z)
      .normalize();
    group.quaternion.setFromUnitVectors(PROJECTILE_AXIS, projectileDirection);
  }
}

function createProjectileView(
  owner: "player" | "enemy",
  coreGeometry: THREE.BufferGeometry,
  glowGeometry: THREE.BufferGeometry,
) {
  const color = new THREE.Color(
    owner === "player" ? PLAYER_SHOT_COLOR : ENEMY_SHOT_COLOR,
  );
  const coreColor = color
    .clone()
    .lerp(new THREE.Color(0xffffff), 0.38)
    .multiplyScalar(3.4);
  const glowColor = color.clone().multiplyScalar(2.6);
  const core = new THREE.Mesh(
    coreGeometry,
    new THREE.MeshBasicMaterial({ color: coreColor }),
  );
  const glow = new THREE.Mesh(
    glowGeometry,
    new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const group = new THREE.Group();
  group.add(glow, core);
  group.scale.y = owner === "player" ? 1.18 : 0.92;
  return group;
}

function createBoltGeometry(radius: number, length: number, segments: number) {
  const halfLength = length / 2;
  const profile = [new THREE.Vector2(0, -halfLength)];
  // The rear converges to one vertex; only the leading end receives a rounded energy cap.
  profile.push(new THREE.Vector2(radius, halfLength - radius));
  for (let step = 1; step <= 4; step++) {
    const angle = ((step / 4) * Math.PI) / 2;
    profile.push(
      new THREE.Vector2(
        radius * Math.cos(angle),
        halfLength - radius + radius * Math.sin(angle),
      ),
    );
  }
  const geometry = new THREE.LatheGeometry(profile, segments);
  geometry.computeVertexNormals();
  return geometry;
}

function splineTurnStrength(distance: number) {
  const before = railFrameAtDistance(
    Math.max(0, distance - BANK_SAMPLE_DISTANCE),
  );
  const after = railFrameAtDistance(distance + BANK_SAMPLE_DISTANCE);
  const headingDelta = Math.atan2(
    Math.sin(after.heading - before.heading),
    Math.cos(after.heading - before.heading),
  );
  return THREE.MathUtils.clamp(headingDelta / FULL_TURN_HEADING_DELTA, -1, 1);
}

const enemyMatrix = new THREE.Matrix4();
const enemyPosition = new THREE.Vector3();
const enemyScale = new THREE.Vector3();
const enemyRotation = new THREE.Quaternion();
const enemyLookAt = new THREE.Matrix4();
const enemyTarget = new THREE.Vector3();
const enemyUp = new THREE.Vector3(0, 1, 0);

function syncEnemyInstances(
  mesh: THREE.InstancedMesh,
  hit: THREE.InstancedBufferAttribute,
  states: FlightSimulation["enemies"],
  baseRadius: number,
  playerPosition: { x: number; y: number; z: number },
) {
  if (states.length > mesh.instanceMatrix.count)
    throw new Error("Riftspike instance capacity exceeded.");
  mesh.count = states.length;
  enemyTarget.set(playerPosition.x, playerPosition.y, playerPosition.z);
  for (let index = 0; index < states.length; index++) {
    const state = states[index];
    const scale = state.radius / baseRadius;
    enemyPosition.set(state.position.x, state.position.y, state.position.z);
    // The Riftspike's modeled forward direction is -Z. Matrix4.lookAt aligns
    // that axis with the player while retaining a stable world-up direction.
    enemyLookAt.lookAt(enemyPosition, enemyTarget, enemyUp);
    enemyRotation.setFromRotationMatrix(enemyLookAt);
    enemyScale.setScalar(scale);
    enemyMatrix.compose(enemyPosition, enemyRotation, enemyScale);
    mesh.setMatrixAt(index, enemyMatrix);
    hit.setX(index, state.hitFlash ?? 0);
  }
  mesh.instanceMatrix.needsUpdate = true;
  hit.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function addInstancedHitFlash(material: THREE.Material, asset = "riftspike") {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float instanceHit;\nvarying float vInstanceHit;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvInstanceHit = instanceHit;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vInstanceHit;",
      )
      .replace(
        "#include <opaque_fragment>",
        "outgoingLight = mix(outgoingLight, vec3(5.0), vInstanceHit);\n#include <opaque_fragment>",
      );
  };
  material.customProgramCacheKey = () => `${asset}-instanced-hit-v1`;
}

function addFlightWindow(scene: THREE.Scene) {
  const points = [
    new THREE.Vector3(-FLIGHT_WINDOW.maxX, FLIGHT_WINDOW.minY, 0),
    new THREE.Vector3(FLIGHT_WINDOW.maxX, FLIGHT_WINDOW.minY, 0),
    new THREE.Vector3(FLIGHT_WINDOW.maxX, FLIGHT_WINDOW.maxY, 0),
    new THREE.Vector3(-FLIGHT_WINDOW.maxX, FLIGHT_WINDOW.maxY, 0),
    new THREE.Vector3(-FLIGHT_WINDOW.maxX, FLIGHT_WINDOW.minY, 0),
  ];
  const guide = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
    }),
  );
  scene.add(guide);
  return guide;
}

function distanceToFrameFlightWindow(camera: THREE.PerspectiveCamera) {
  const paddedHalfWidth = FLIGHT_WINDOW.maxX + FLIGHT_WINDOW.cameraPadding;
  const paddedHalfHeight =
    (FLIGHT_WINDOW.maxY - FLIGHT_WINDOW.minY) / 2 + FLIGHT_WINDOW.cameraPadding;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov =
    2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const verticalDistance = paddedHalfHeight / Math.tan(verticalFov / 2);
  const horizontalDistance = paddedHalfWidth / Math.tan(horizontalFov / 2);
  return Math.max(verticalDistance, horizontalDistance);
}

function addSplineGuide(scene: THREE.Scene) {
  const guide = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xff4dff }),
  );
  guide.visible = false;
  scene.add(guide);
  return guide;
}

function updateSplineGuide(guide: THREE.Line, currentDistance: number) {
  const points: THREE.Vector3[] = [];
  for (
    let distance = Math.max(0, currentDistance - 40);
    distance <= currentDistance + 460;
    distance += 4
  ) {
    const frame = railFrameAtDistance(distance);
    points.push(new THREE.Vector3(frame.position.x, 0.12, frame.position.z));
  }
  guide.geometry.dispose();
  guide.geometry = new THREE.BufferGeometry().setFromPoints(points);
}
