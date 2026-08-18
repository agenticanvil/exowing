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
import type { GameAssets } from "../assets/gameAssets";
import { JetExhaustView } from "./jetExhaustView";
import { WingtipVortexView } from "./wingtipVortexView";
import type { Vec3 } from "../sim/types";
import {
  FLIGHT_FOG_FAR_DISTANCE,
  FLIGHT_FOG_NEAR_DISTANCE,
} from "../game/flightDistances";
import { EnemyDestructionView } from "./enemyDestructionView";
import { ENEMIES, enemyIdsForPlan, type EnemyId } from "../enemies";
import {
  DEFAULT_GAMEPLAY_CAMERA_FOV,
  levelIntroCameraPose,
} from "./levelIntroCamera";
import { levelOutroPose } from "./levelOutroCamera";
import { PICKUPS } from "../pickups";
import { createSoftParticleUniforms, SoftParticlePass } from "./softParticles";

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
const OVERSHIELD_COLOR = new THREE.Color(0x49eaff).multiplyScalar(2.4);
const OVERSHIELD_HIT_COLOR = new THREE.Color(0xff241c).multiplyScalar(3);
const OVERSHIELD_HIT_FLASH_DURATION = 0.24;
type EnemyInstanceView = {
  mesh: THREE.InstancedMesh;
  hit: THREE.InstancedBufferAttribute;
  attack: THREE.InstancedBufferAttribute;
  baseRadius: number;
};
export type GameViewSequence =
  | { kind: "intro"; progress: number }
  | {
      kind: "outro";
      progress: number;
      elapsedSeconds: number;
      durationSeconds: number;
    };

export class GameView {
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly softParticleScene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(
    DEFAULT_GAMEPLAY_CAMERA_FOV,
    1,
    0.1,
    500,
  );
  private readonly composer: EffectComposer;
  private readonly softParticleUniforms = createSoftParticleUniforms();
  private readonly fxaaPass = new FXAAPass();
  private readonly ship = new THREE.Group();
  private readonly playerModel: THREE.Group;
  private overshieldShell: ReturnType<typeof createOvershieldShell>;
  private overshieldHitFlashUntil = 0;
  private jetExhaust: JetExhaustView;
  private wingtipVortices?: WingtipVortexView;
  private readonly hasAtmosphere: boolean;
  private readonly enemyViews = new Map<EnemyId, EnemyInstanceView>();
  private readonly enemyDestructions: EnemyDestructionView;
  private readonly projectileViews = new Map<number, THREE.Group>();
  private readonly pickupViews = new Map<number, THREE.Group>();
  private readonly chainLightningViews = new Map<number, THREE.LineSegments>();
  private readonly createPickup?: GameAssets["createPickup"];
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
    this.createPickup = assets?.createPickup;
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
    const composerTarget = new THREE.WebGLRenderTarget(
      innerWidth,
      innerHeight,
      {
        type: THREE.HalfFloatType,
        depthTexture: new THREE.DepthTexture(innerWidth, innerHeight),
      },
    );
    this.composer = new EffectComposer(this.renderer, composerTarget);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new SoftParticlePass(
        this.softParticleScene,
        this.camera,
        this.softParticleUniforms,
      ),
    );
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
    this.softParticleScene.fog = this.scene.fog;

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

    this.playerModel = assets?.createPlayer() ?? createPlaceholderShip();
    this.overshieldShell = createOvershieldShell(this.playerModel);
    this.ship.add(this.playerModel, this.overshieldShell.group);
    this.jetExhaust = new JetExhaustView(this.playerModel);
    this.wingtipVortices = this.hasAtmosphere
      ? new WingtipVortexView(this.scene, this.playerModel)
      : undefined;
    this.scene.add(this.ship);
    const destructionSources = new Map<
      EnemyId,
      {
        geometry: THREE.BufferGeometry;
        material: THREE.Material;
        baseRadius: number;
        fragmentCount: number;
      }
    >();
    for (const enemyId of enemyIdsForPlan(level.enemies)) {
      const source = assets?.createEnemy(enemyId) ?? createPlaceholderEnemy();
      if (Array.isArray(source.material))
        throw new Error(`${ENEMIES[enemyId].label} must use one material.`);
      const destructionMaterial = source.material.clone();
      addInstancedHitFlash(
        source.material,
        enemyId,
        environment.enemyFillIntensity ?? 0,
      );
      source.geometry.computeBoundingSphere();
      const baseRadius = source.geometry.boundingSphere?.radius ?? 1;
      const hit = new THREE.InstancedBufferAttribute(new Float32Array(256), 1);
      const attack = new THREE.InstancedBufferAttribute(
        new Float32Array(256),
        1,
      );
      source.geometry.setAttribute("instanceHit", hit);
      source.geometry.setAttribute("instanceAttack", attack);
      const mesh = new THREE.InstancedMesh(
        source.geometry,
        source.material,
        256,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      this.enemyViews.set(enemyId, { mesh, hit, attack, baseRadius });
      this.scene.add(mesh);
      destructionSources.set(enemyId, {
        geometry: source.geometry,
        material: destructionMaterial,
        baseRadius,
        fragmentCount: ENEMIES[enemyId].destructionFragments,
      });
    }
    this.enemyDestructions = new EnemyDestructionView(
      this.scene,
      this.softParticleScene,
      this.softParticleUniforms,
      destructionSources,
    );
    for (const source of destructionSources.values()) source.material.dispose();

    this.flightWindowGuide = addFlightWindow(this.scene);
    this.flightWindowGuide.visible = false;
    this.splineGuide = addSplineGuide(this.scene);
    this.reticle = createReticle();
    this.scene.add(this.reticle.group);
    window.addEventListener("resize", this.resize);
    this.resize();
  }

  sync(sim: FlightSimulation, sequence?: GameViewSequence) {
    const renderTime = performance.now() * 0.001;
    const renderDt = renderTime - this.previousRenderTime;
    this.jetExhaust.update(sim.railSpeed, renderDt);
    this.previousRenderTime = renderTime;
    const rail = railFrameAtDistance(sim.railDistance);
    const baseShipPosition = railOffsetPosition(
      sim.railDistance,
      sim.player.offsetX,
      sim.player.offsetY,
    );
    const windowCenterY = (FLIGHT_WINDOW.minY + FLIGHT_WINDOW.maxY) / 2;
    const cameraDistance = distanceToFrameFlightWindow(
      this.camera,
      DEFAULT_GAMEPLAY_CAMERA_FOV,
    );
    const railCenter = railOffsetPosition(sim.railDistance, 0, windowCenterY);
    const gameplayShipPitch = playerPitch(
      sim.player.offsetY,
      sim.player.velocityY,
    );
    const turnBank = splineTurnStrength(sim.railDistance) * TURN_BANK;
    const inputBank = (sim.player.velocityX / 12) * INPUT_BANK;
    const barrelRoll =
      sim.player.rollDirection * sim.player.rollProgress * Math.PI * 2;
    const gameplayShipRoll = normalizeAngle(turnBank + inputBank + barrelRoll);
    const outroPose =
      sequence?.kind === "outro"
        ? levelOutroPose(
            railCenter,
            baseShipPosition,
            rail.forward,
            rail.right,
            cameraDistance,
            gameplayShipPitch,
            gameplayShipRoll,
            sequence.progress,
            sequence.elapsedSeconds,
            sequence.durationSeconds,
          )
        : undefined;
    const renderedShipPosition = outroPose?.shipPosition ?? baseShipPosition;
    this.ship.position.set(
      renderedShipPosition.x,
      renderedShipPosition.y,
      renderedShipPosition.z,
    );
    this.ship.rotation.y = -rail.heading;
    this.ship.rotation.z = outroPose?.shipRoll ?? gameplayShipRoll;
    this.ship.rotation.x = outroPose?.shipPitch ?? gameplayShipPitch;
    this.ship.updateMatrixWorld(true);
    const overshieldHit =
      THREE.MathUtils.clamp(
        (this.overshieldHitFlashUntil - renderTime) /
          OVERSHIELD_HIT_FLASH_DURATION,
        0,
        1,
      ) ** 0.55;
    this.overshieldShell.group.visible =
      sim.player.overshield > 0 || overshieldHit > 0;
    this.overshieldShell.material.color
      .copy(OVERSHIELD_COLOR)
      .lerp(OVERSHIELD_HIT_COLOR, overshieldHit);
    this.overshieldShell.material.opacity =
      (0.42 + Math.sin(renderTime * 6) * 0.06) *
      Math.max(Math.min(1, sim.player.overshield / 3), overshieldHit);
    this.wingtipVortices?.update(sim.railSpeed, renderDt);
    for (const [enemyId, enemyView] of this.enemyViews)
      syncEnemyInstances(
        enemyView.mesh,
        enemyView.hit,
        enemyView.attack,
        sim.enemies.filter((enemy) => enemy.enemyId === enemyId),
        enemyView.baseRadius,
        baseShipPosition,
        ENEMIES[enemyId].label,
      );
    this.enemyDestructions.sync(
      sim.enemyDestructions,
      baseShipPosition,
      Math.min(renderDt, 0.1),
    );
    syncProjectiles(
      this.scene,
      this.projectileViews,
      sim.projectiles,
      this.shotCoreGeometry,
      this.shotGlowGeometry,
    );
    syncPickups(
      this.scene,
      this.pickupViews,
      sim.pickups,
      renderTime,
      this.createPickup,
    );
    syncChainLightnings(
      this.scene,
      this.chainLightningViews,
      sim.chainLightnings,
    );
    const cameraPose =
      outroPose === undefined
        ? levelIntroCameraPose(
            railCenter,
            baseShipPosition,
            rail.forward,
            rail.right,
            cameraDistance,
            sequence?.kind === "intro" ? sequence.progress : 1,
          )
        : {
            position: outroPose.cameraPosition,
            target: outroPose.cameraTarget,
            fov: outroPose.cameraFov,
            roll: 0,
          };
    this.camera.position.set(
      cameraPose.position.x,
      cameraPose.position.y,
      cameraPose.position.z,
    );
    if (this.camera.fov !== cameraPose.fov) {
      this.camera.fov = cameraPose.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(
      cameraPose.target.x,
      cameraPose.target.y,
      cameraPose.target.z,
    );
    this.camera.rotateZ(cameraPose.roll);
    const firingOrigin = railOffsetPosition(
      sim.railDistance + 2,
      sim.player.offsetX,
      sim.player.offsetY,
    );
    const firingDirection = { x: rail.forward.x, y: 0, z: rail.forward.z };
    syncReticle(
      this.reticle,
      firingOrigin,
      firingDirection,
      sim.aimSolution,
      sim.player.missileLockTargetIds,
    );
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

  setAgXToneMapping(enabled: boolean) {
    this.renderer.toneMapping = enabled
      ? THREE.AgXToneMapping
      : THREE.ACESFilmicToneMapping;
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

  flashOvershieldHit() {
    this.overshieldHitFlashUntil =
      performance.now() * 0.001 + OVERSHIELD_HIT_FLASH_DURATION;
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

  positionAlongCameraForward(distance: number): Vec3 {
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    return {
      x: this.ship.position.x + direction.x * distance,
      y: this.ship.position.y + direction.y * distance,
      z: this.ship.position.z + direction.z * distance,
    };
  }

  dispose() {
    window.removeEventListener("resize", this.resize);
    this.world.dispose();
    this.jetExhaust.dispose();
    this.wingtipVortices?.dispose();
    this.enemyDestructions.dispose();
    disposeObject(this.overshieldShell.group);
    disposeObject(this.playerModel);
    this.ship.removeFromParent();
    for (const group of this.projectileViews.values())
      disposeObject(group, false);
    for (const group of this.pickupViews.values()) disposeObject(group);
    for (const lightning of this.chainLightningViews.values())
      disposeObject(lightning);
    for (const enemyView of this.enemyViews.values())
      disposeObject(enemyView.mesh);
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
    this.pickupViews.clear();
    this.chainLightningViews.clear();
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
  solution:
    | {
        enemyId: number;
        targetPosition: Vec3;
        precision: boolean;
      }
    | undefined,
  missileLockTargetIds: readonly number[],
) {
  const distances = [RETICLE_NEAR_DISTANCE, RETICLE_FAR_DISTANCE];
  for (let index = 0; index < reticle.markers.length; index++) {
    const marker = reticle.markers[index];
    const distance = distances[index];
    if (index === 1 && solution)
      marker.position.set(
        solution.targetPosition.x,
        solution.targetPosition.y,
        solution.targetPosition.z,
      );
    else
      marker.position.set(
        origin.x + direction.x * distance,
        origin.y + direction.y * distance,
        origin.z + direction.z * distance,
      );
    const material = marker.material as THREE.SpriteMaterial;
    material.color.setHex(
      solution?.precision
        ? 0x7effb2
        : solution && missileLockTargetIds.includes(solution.enemyId)
          ? 0xff83ec
          : solution
            ? 0xffd56a
            : RETICLE_COLOR,
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

function createOvershieldShell(playerModel: THREE.Group) {
  const material = new THREE.MeshBasicMaterial({
    color: OVERSHIELD_COLOR,
    wireframe: true,
    transparent: true,
    opacity: 0.46,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const group = playerModel.clone(true);
  group.name = "overshield-wireframe";
  group.scale.setScalar(1.33);
  group.visible = false;
  group.renderOrder = 3;
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry = object.geometry.clone();
    object.material = material;
    object.castShadow = false;
    object.receiveShadow = false;
    object.renderOrder = 3;
  });
  return { group, material };
}

function createPlaceholderPickup(pickupId: keyof typeof PICKUPS) {
  const hue = Object.keys(PICKUPS).indexOf(pickupId) / 7;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(hue, 0.78, 0.58),
    emissive: new THREE.Color().setHSL(hue, 0.72, 0.22),
    roughness: 0.32,
  });
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 1), material);
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

function syncPickups(
  scene: THREE.Scene,
  views: Map<number, THREE.Group>,
  states: FlightSimulation["pickups"],
  renderTime: number,
  createPickup?: GameAssets["createPickup"],
) {
  const live = new Set(states.map((state) => state.id));
  for (const [id, group] of views)
    if (!live.has(id)) {
      disposeObject(group);
      views.delete(id);
    }
  for (const state of states) {
    let group = views.get(state.id);
    if (!group) {
      group =
        createPickup?.(state.pickupId) ??
        createPlaceholderPickup(state.pickupId);
      group.scale.setScalar(1.55);
      views.set(state.id, group);
      scene.add(group);
    }
    group.position.set(
      state.position.x,
      state.position.y + Math.sin(renderTime * 2.2 + state.id) * 0.3,
      state.position.z,
    );
    group.rotation.y = renderTime * 0.82 + state.id * 0.73;
  }
}

function syncChainLightnings(
  scene: THREE.Scene,
  views: Map<number, THREE.LineSegments>,
  states: FlightSimulation["chainLightnings"],
) {
  const live = new Set(states.map((state) => state.id));
  for (const [id, line] of views)
    if (!live.has(id)) {
      disposeObject(line);
      views.delete(id);
    }
  for (const state of states) {
    let line = views.get(state.id);
    if (!line) {
      line = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(0x72f7ff).multiplyScalar(4.2),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      line.renderOrder = 8;
      views.set(state.id, line);
      scene.add(line);
    }
    const positions = lightningSegmentPositions(state);
    line.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    line.geometry.computeBoundingSphere();
    (line.material as THREE.LineBasicMaterial).opacity = Math.max(
      0,
      1 - state.age / state.duration,
    );
  }
}

function lightningSegmentPositions(
  state: FlightSimulation["chainLightnings"][number],
) {
  const positions: number[] = [];
  const subdivisions = 7;
  for (let arc = 0; arc < state.points.length - 1; arc++) {
    const start = state.points[arc];
    const end = state.points[arc + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const horizontalLength = Math.hypot(dx, dz) || 1;
    const perpendicular = {
      x: -dz / horizontalLength,
      z: dx / horizontalLength,
    };
    const pointAt = (step: number) => {
      const progress = step / subdivisions;
      const envelope = Math.sin(progress * Math.PI);
      const phase = state.id * 1.91 + state.age * 92 + step * 2.37;
      const jitter = Math.sin(phase) * 0.3 * envelope;
      return {
        x: start.x + dx * progress + perpendicular.x * jitter,
        y: start.y + dy * progress + Math.cos(phase * 1.31) * 0.22 * envelope,
        z: start.z + dz * progress + perpendicular.z * jitter,
      };
    };
    for (let step = 0; step < subdivisions; step++) {
      const from = pointAt(step);
      const to = pointAt(step + 1);
      positions.push(from.x, from.y, from.z, to.x, to.y, to.z);
    }
  }
  return positions;
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
      group = createProjectileView(state, coreGeometry, glowGeometry);
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
  state: FlightSimulation["projectiles"][number],
  coreGeometry: THREE.BufferGeometry,
  glowGeometry: THREE.BufferGeometry,
) {
  const owner = state.owner;
  const isMissile = state.kind === "homing-missile";
  const overcharged = state.overcharged === true;
  const color = new THREE.Color(
    isMissile
      ? 0xffd34d
      : owner === "player"
        ? overcharged
          ? 0x8c7bff
          : PLAYER_SHOT_COLOR
        : ENEMY_SHOT_COLOR,
  );
  const coreColor = color
    .clone()
    .lerp(new THREE.Color(0xffffff), 0.38)
    .multiplyScalar(overcharged ? 5.4 : 3.4);
  const glowColor = color.clone().multiplyScalar(overcharged ? 4.5 : 2.6);
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
  group.scale.y = isMissile ? 1.65 : owner === "player" ? 1.18 : 0.92;
  if (overcharged) group.scale.multiplyScalar(1.55);
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

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
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
  attack: THREE.InstancedBufferAttribute,
  states: FlightSimulation["enemies"],
  baseRadius: number,
  playerPosition: { x: number; y: number; z: number },
  label: string,
) {
  if (states.length > mesh.instanceMatrix.count)
    throw new Error(`${label} instance capacity exceeded.`);
  mesh.count = states.length;
  enemyTarget.set(playerPosition.x, playerPosition.y, playerPosition.z);
  for (let index = 0; index < states.length; index++) {
    const state = states[index];
    const scale = state.radius / baseRadius;
    enemyPosition.set(state.position.x, state.position.y, state.position.z);
    // Standard enemies are modeled facing -Z. Matrix4.lookAt aligns that axis
    // with the player while retaining a stable world-up direction.
    enemyLookAt.lookAt(enemyPosition, enemyTarget, enemyUp);
    enemyRotation.setFromRotationMatrix(enemyLookAt);
    enemyScale.setScalar(scale);
    enemyMatrix.compose(enemyPosition, enemyRotation, enemyScale);
    mesh.setMatrixAt(index, enemyMatrix);
    hit.setX(index, state.hitFlash ?? 0);
    attack.setX(index, state.attackTelegraph ?? 0);
  }
  mesh.instanceMatrix.needsUpdate = true;
  hit.needsUpdate = true;
  attack.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function addInstancedHitFlash(
  material: THREE.Material,
  asset: EnemyId,
  enemyFillIntensity: number,
) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.enemyFillIntensity = { value: enemyFillIntensity };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float instanceHit;\nattribute float instanceAttack;\nvarying float vInstanceHit;\nvarying float vInstanceAttack;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvInstanceHit = instanceHit;\nvInstanceAttack = instanceAttack;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float enemyFillIntensity;\nvarying float vInstanceHit;\nvarying float vInstanceAttack;",
      )
      .replace(
        "#include <opaque_fragment>",
        "vec3 enemyFillDirection = normalize(vec3(-0.28, 0.42, 0.86));\nfloat enemyFill = smoothstep(-0.28, 0.72, dot(normal, enemyFillDirection));\noutgoingLight += diffuseColor.rgb * vec3(0.78, 0.9, 1.0) * enemyFill * enemyFillIntensity;\noutgoingLight = mix(outgoingLight, vec3(3.4, 0.35, 0.08), vInstanceAttack * 0.82);\noutgoingLight = mix(outgoingLight, vec3(5.0), vInstanceHit);\n#include <opaque_fragment>",
      );
  };
  material.customProgramCacheKey = () =>
    `${asset}-instanced-hit-v2-${enemyFillIntensity}`;
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

function distanceToFrameFlightWindow(
  camera: THREE.PerspectiveCamera,
  verticalFovDegrees = camera.fov,
) {
  const paddedHalfWidth = FLIGHT_WINDOW.maxX + FLIGHT_WINDOW.cameraPadding;
  const paddedHalfHeight =
    (FLIGHT_WINDOW.maxY - FLIGHT_WINDOW.minY) / 2 + FLIGHT_WINDOW.cameraPadding;
  const verticalFov = THREE.MathUtils.degToRad(verticalFovDegrees);
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
