import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { LevelDefinition } from '../levels';
import { FLIGHT_WINDOW, type FlightSimulation } from '../sim/flightSimulation';
import { railFrameAtDistance, railOffsetPosition } from '../sim/railSystem';
import { SkyView } from './skyView';
import type { WorldRuntime } from '../world/worldSystem';

const TURN_BANK = THREE.MathUtils.degToRad(20);
const INPUT_BANK = THREE.MathUtils.degToRad(6);
const BANK_SAMPLE_DISTANCE = 14;
const FULL_TURN_HEADING_DELTA = THREE.MathUtils.degToRad(10.5);
const PROJECTILE_AXIS = new THREE.Vector3(0, 1, 0);
const projectileDirection = new THREE.Vector3();
const PLAYER_SHOT_COLOR = 0x35f2ff;
const ENEMY_SHOT_COLOR = 0xff3b32;

export class GameView {
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
  private readonly composer: EffectComposer;
  private readonly fxaaPass = new FXAAPass();
  private readonly ship: THREE.Mesh;
  private readonly enemyViews = new Map<number, THREE.Mesh>();
  private readonly projectileViews = new Map<number, THREE.Group>();
  private readonly enemyGeometry = new THREE.SphereGeometry(1.25, 16, 10);
  private readonly enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xf04453, roughness: 0.65 });
  private readonly bossMaterial = new THREE.MeshStandardMaterial({ color: 0x8f1637, emissive: 0x3d0718, emissiveIntensity: 0.8, roughness: 0.42 });
  private readonly shotCoreGeometry = createBoltGeometry(0.085, 2.35, 12);
  private readonly shotGlowGeometry = createBoltGeometry(0.19, 2.9, 12);
  private readonly sky: SkyView;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly flightWindowGuide: THREE.Line;
  private readonly splineGuide: THREE.Line;
  private readonly sunDirection: THREE.Vector3;
  private renderScale = 1;

  constructor(container: HTMLElement, level: LevelDefinition, private readonly world: WorldRuntime) {
    const environment = level.environment;
    this.sunDirection = new THREE.Vector3(...environment.sunDirection).normalize();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = environment.exposure;
    container.append(this.renderer.domElement);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.68, 0.22, 2));
    this.composer.addPass(this.fxaaPass);
    this.composer.addPass(new OutputPass());
    const horizonColor = new THREE.Color(environment.horizon);
    this.scene.background = horizonColor;
    this.scene.fog = new THREE.Fog(horizonColor, 80, 190);

    this.scene.add(new THREE.HemisphereLight(
      environment.hemisphereSky,
      environment.hemisphereGround,
      environment.hemisphereIntensity,
    ));
    this.sunLight = new THREE.DirectionalLight(environment.sunColor, environment.sunIntensity);
    this.scene.add(this.sunLight, this.sunLight.target);

    this.sky = new SkyView(level);
    this.scene.add(this.sky.mesh);

    this.world.attach(this.scene, environment);

    const shape = new THREE.Shape();
    shape.moveTo(0, 1.35);
    shape.lineTo(-1.15, -1.05);
    shape.lineTo(0, -0.55);
    shape.lineTo(1.15, -1.05);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: false });
    geometry.center();
    geometry.rotateX(Math.PI / 2);
    this.ship = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xf2f5f7, roughness: 0.5 }));
    this.ship.scale.setScalar(1.15);
    this.scene.add(this.ship);

    this.flightWindowGuide = addFlightWindow(this.scene);
    this.flightWindowGuide.visible = false;
    this.splineGuide = addSplineGuide(this.scene);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  sync(sim: FlightSimulation) {
    const rail = railFrameAtDistance(sim.railDistance);
    const shipPosition = railOffsetPosition(sim.railDistance, sim.player.offsetX, sim.player.offsetY);
    this.ship.position.set(shipPosition.x, shipPosition.y, shipPosition.z);
    this.ship.rotation.y = -rail.heading;
    const turnBank = splineTurnStrength(sim.railDistance) * TURN_BANK;
    const inputBank = sim.player.velocityX / 12 * INPUT_BANK;
    this.ship.rotation.z = turnBank + inputBank;
    this.ship.rotation.x = sim.player.velocityY * 0.012;
    syncEnemyMeshes(this.scene, this.enemyViews, sim.enemies, this.enemyGeometry, this.enemyMaterial, this.bossMaterial);
    syncProjectiles(this.scene, this.projectileViews, sim.projectiles, this.shotCoreGeometry, this.shotGlowGeometry);
    const windowCenterY = (FLIGHT_WINDOW.minY + FLIGHT_WINDOW.maxY) / 2;
    const cameraDistance = distanceToFrameFlightWindow(this.camera);
    const railCenter = railOffsetPosition(sim.railDistance, 0, windowCenterY);
    this.camera.position.set(
      railCenter.x - rail.forward.x * cameraDistance,
      railCenter.y,
      railCenter.z - rail.forward.z * cameraDistance,
    );
    this.camera.lookAt(railCenter.x, railCenter.y, railCenter.z);
    this.sky.update(this.camera.position);
    this.sunLight.target.position.set(railCenter.x, railCenter.y, railCenter.z);
    this.sunLight.position.copy(this.sunLight.target.position).addScaledVector(this.sunDirection, 120);
    this.world.render(rail.position.x, rail.position.z, performance.now() * 0.001);
    this.flightWindowGuide.position.set(rail.position.x, 0, rail.position.z);
    this.flightWindowGuide.rotation.y = Math.PI - rail.heading;
    if (this.splineGuide.visible) updateSplineGuide(this.splineGuide, sim.railDistance);
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

  getRenderResolution() {
    return {
      width: Math.round(innerWidth * Math.min(devicePixelRatio, 2) * this.renderScale),
      height: Math.round(innerHeight * Math.min(devicePixelRatio, 2) * this.renderScale),
    };
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.composer.dispose();
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.world.dispose();
    this.enemyViews.clear();
    this.projectileViews.clear();
  }

  private resize = () => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * this.renderScale);
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  };
}

function syncProjectiles(
  scene: THREE.Scene,
  views: Map<number, THREE.Group>,
  states: FlightSimulation['projectiles'],
  coreGeometry: THREE.BufferGeometry,
  glowGeometry: THREE.BufferGeometry,
) {
  const live = new Set(states.map((state) => state.id));
  for (const [id, group] of views) if (!live.has(id)) {
    scene.remove(group);
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
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
    projectileDirection.set(state.velocity.x, state.velocity.y, state.velocity.z).normalize();
    group.quaternion.setFromUnitVectors(PROJECTILE_AXIS, projectileDirection);
  }
}

function createProjectileView(
  owner: 'player' | 'enemy',
  coreGeometry: THREE.BufferGeometry,
  glowGeometry: THREE.BufferGeometry,
) {
  const color = new THREE.Color(owner === 'player' ? PLAYER_SHOT_COLOR : ENEMY_SHOT_COLOR);
  const coreColor = color.clone().lerp(new THREE.Color(0xffffff), 0.38).multiplyScalar(3.4);
  const glowColor = color.clone().multiplyScalar(2.6);
  const core = new THREE.Mesh(coreGeometry, new THREE.MeshBasicMaterial({ color: coreColor }));
  const glow = new THREE.Mesh(glowGeometry, new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  const group = new THREE.Group();
  group.add(glow, core);
  group.scale.y = owner === 'player' ? 1.18 : 0.92;
  return group;
}

function createBoltGeometry(radius: number, length: number, segments: number) {
  const halfLength = length / 2;
  const profile = [new THREE.Vector2(0, -halfLength)];
  // The rear converges to one vertex; only the leading end receives a rounded energy cap.
  profile.push(new THREE.Vector2(radius, halfLength - radius));
  for (let step = 1; step <= 4; step++) {
    const angle = step / 4 * Math.PI / 2;
    profile.push(new THREE.Vector2(
      radius * Math.cos(angle),
      halfLength - radius + radius * Math.sin(angle),
    ));
  }
  const geometry = new THREE.LatheGeometry(profile, segments);
  geometry.computeVertexNormals();
  return geometry;
}

function splineTurnStrength(distance: number) {
  const before = railFrameAtDistance(Math.max(0, distance - BANK_SAMPLE_DISTANCE));
  const after = railFrameAtDistance(distance + BANK_SAMPLE_DISTANCE);
  const headingDelta = Math.atan2(
    Math.sin(after.heading - before.heading),
    Math.cos(after.heading - before.heading),
  );
  return THREE.MathUtils.clamp(headingDelta / FULL_TURN_HEADING_DELTA, -1, 1);
}

function syncMeshes(
  scene: THREE.Scene,
  views: Map<number, THREE.Mesh>,
  states: Array<{ id: number; position: { x: number; y: number; z: number } }>,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
) {
  const live = new Set(states.map((state) => state.id));
  for (const [id, mesh] of views) if (!live.has(id)) { scene.remove(mesh); views.delete(id); }
  for (const state of states) {
    let mesh = views.get(state.id);
    if (!mesh) { mesh = new THREE.Mesh(geometry, material); views.set(state.id, mesh); scene.add(mesh); }
    mesh.position.set(state.position.x, state.position.y, state.position.z);
  }
}

function syncEnemyMeshes(
  scene: THREE.Scene,
  views: Map<number, THREE.Mesh>,
  states: FlightSimulation['enemies'],
  geometry: THREE.BufferGeometry,
  enemyMaterial: THREE.Material,
  bossMaterial: THREE.Material,
) {
  const live = new Set(states.map((state) => state.id));
  for (const [id, mesh] of views) if (!live.has(id)) { scene.remove(mesh); views.delete(id); }
  for (const state of states) {
    let mesh = views.get(state.id);
    if (!mesh) {
      mesh = new THREE.Mesh(geometry, state.kind === 'boss' ? bossMaterial : enemyMaterial);
      views.set(state.id, mesh);
      scene.add(mesh);
    }
    mesh.position.set(state.position.x, state.position.y, state.position.z);
    mesh.scale.setScalar(state.kind === 'boss' ? state.radius / 1.25 : 1);
  }
}

function addFlightWindow(scene: THREE.Scene) {
  const points = [
    new THREE.Vector3(-FLIGHT_WINDOW.maxX, FLIGHT_WINDOW.minY, 0),
    new THREE.Vector3(FLIGHT_WINDOW.maxX, FLIGHT_WINDOW.minY, 0),
    new THREE.Vector3(FLIGHT_WINDOW.maxX, FLIGHT_WINDOW.maxY, 0),
    new THREE.Vector3(-FLIGHT_WINDOW.maxX, FLIGHT_WINDOW.maxY, 0),
    new THREE.Vector3(-FLIGHT_WINDOW.maxX, FLIGHT_WINDOW.minY, 0),
  ];
  const guide = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 }));
  scene.add(guide);
  return guide;
}

function distanceToFrameFlightWindow(camera: THREE.PerspectiveCamera) {
  const paddedHalfWidth = FLIGHT_WINDOW.maxX + FLIGHT_WINDOW.cameraPadding;
  const paddedHalfHeight = (FLIGHT_WINDOW.maxY - FLIGHT_WINDOW.minY) / 2 + FLIGHT_WINDOW.cameraPadding;
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
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
  for (let distance = Math.max(0, currentDistance - 40); distance <= currentDistance + 460; distance += 4) {
    const frame = railFrameAtDistance(distance);
    points.push(new THREE.Vector3(frame.position.x, 0.12, frame.position.z));
  }
  guide.geometry.dispose();
  guide.geometry = new THREE.BufferGeometry().setFromPoints(points);
}
