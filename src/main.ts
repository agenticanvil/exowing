import "./style.css";
import { InputState } from "./input/inputState";
import { LEVEL_IDS, LEVELS, type LevelId } from "./levels";
import { ENEMIES, type LevelEnemyPlan } from "./enemies";
import { createWorld } from "./world/worldSystem";
import { FlightSimulation } from "./sim/flightSimulation";
import { GameView } from "./view/gameView";
import { loadGameAssets, type AssetLoadProgress } from "./assets/gameAssets";
import { mountAppShell, requiredElement } from "./ui/appShell";
import { GameLifecycle } from "./game/gameLifecycle";
import { performanceRecorder } from "./performance";
import { createAudioSystem, DEFAULT_AUDIO_SETTINGS } from "./audio";
import { FlightAudioFeedback } from "./game/flightAudioFeedback";
import { installMenuKeyboard } from "./input/menuKeyboard";
import { FlightEventBus } from "./game/flightEvents";
import {
  createLevelStats,
  recordLevelStep,
  summarizeLevelStats,
} from "./game/levelStats";
import type { GameViewSequence } from "./view/gameView";
import { createTransitionTourPlan } from "./game/enemyEncounters";
import { PICKUPS, type PickupId } from "./pickups";
import {
  availableUpgrades,
  hasUpgradeAfterLevel,
  UPGRADES,
  upgradeStatus,
  upgradesUnlockedBy,
  type UpgradeId,
} from "./upgrades";
import type { CampaignCarry } from "./sim/types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing app root");
const appRoot = app;
mountAppShell(app);

if (performanceRecorder.enabled)
  window.exowingPerformance = {
    enabled: true,
    reset: () => performanceRecorder.reset(),
    summary: () => performanceRecorder.summary(),
    exportData: () => performanceRecorder.exportData(),
  };

const initialWorld = createWorld(LEVELS[1].systems);
const input = new InputState();
input.setEnabled(false);
installMenuKeyboard();
const audio = createAudioSystem();
const audioFeedback = new FlightAudioFeedback(audio);
const flightEvents = new FlightEventBus();
flightEvents.subscribe((event) => audioFeedback.handle(event));
let simulation = new FlightSimulation({
  enemyPlan: LEVELS[1].enemies,
  world: initialWorld,
  events: flightEvents,
});
const unlockAudio = () => void audio.resume().catch(() => undefined);
window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });
let currentLevelNumber = 1;
let view = new GameView(appRoot, LEVELS[1], initialWorld);
const score = document.querySelector<HTMLSpanElement>("#score");
const shield = requiredElement<HTMLSpanElement>("#shield");
const shieldFill = requiredElement<HTMLDivElement>("#shield-fill");
const shieldTrack = requiredElement<HTMLDivElement>(".hud__shield-track");
const missileAmmo = requiredElement<HTMLElement>("#missile-ammo");
const missileLocks = requiredElement<HTMLElement>("#missile-locks");
const pickupReserve = requiredElement<HTMLElement>("#pickup-reserve");
const pickupStatus = requiredElement<HTMLElement>("#pickup-status");
const damageVignette = requiredElement<HTMLDivElement>("#damage-vignette");
const levelTransition = requiredElement<HTMLDivElement>("#level-transition");
const levelTransitionLabel = requiredElement<HTMLSpanElement>(
  "#level-transition-label",
);
const loadingScreen = requiredElement<HTMLDivElement>("#loading-screen");
const loadingEyebrow =
  requiredElement<HTMLParagraphElement>("#loading-eyebrow");
const loadingTitle = requiredElement<HTMLHeadingElement>("#loading-title");
const loadingFill = requiredElement<HTMLDivElement>("#loading-fill");
const loadingStatus = requiredElement<HTMLParagraphElement>("#loading-status");
const loadingRetry = requiredElement<HTMLButtonElement>("#loading-retry");
const levelIntro = requiredElement<HTMLElement>("#level-intro");
const levelIntroEyebrow = requiredElement<HTMLParagraphElement>(
  "#level-intro-eyebrow",
);
const levelIntroTitle =
  requiredElement<HTMLHeadingElement>("#level-intro-title");
const levelResults = requiredElement<HTMLElement>("#level-results");
const levelResultsTitle = requiredElement<HTMLHeadingElement>(
  "#level-results-title",
);
const levelResultsKillPercent = requiredElement<HTMLElement>(
  "#level-results-kill-percent",
);
const levelResultsEnemies = requiredElement<HTMLElement>(
  "#level-results-enemies",
);
const levelResultsAccuracy = requiredElement<HTMLElement>(
  "#level-results-accuracy",
);
const levelResultsShots = requiredElement<HTMLElement>("#level-results-shots");
const levelResultsDamage = requiredElement<HTMLElement>(
  "#level-results-damage",
);
const levelResultsTime = requiredElement<HTMLElement>("#level-results-time");
const levelResultsScore = requiredElement<HTMLElement>("#level-results-score");
const levelResultsContinue = requiredElement<HTMLButtonElement>(
  "#level-results-continue",
);
const upgradeScreen = requiredElement<HTMLElement>("#upgrade-screen");
const upgradeButtons = [
  ...document.querySelectorAll<HTMLButtonElement>("[data-upgrade-id]"),
];
const upgradeNextLevel = requiredElement<HTMLElement>("#upgrade-next-level");
const upgradePointsRemaining = requiredElement<HTMLElement>(
  "#upgrade-points-remaining",
);
const upgradeDetailState = requiredElement<HTMLElement>(
  "#upgrade-detail-state",
);
const upgradeDetailLabel = requiredElement<HTMLElement>(
  "#upgrade-detail-label",
);
const upgradeDetailEffect = requiredElement<HTMLElement>(
  "#upgrade-detail-effect",
);
const upgradeDetailUnlocks = requiredElement<HTMLElement>(
  "#upgrade-detail-unlocks",
);
const upgradeDetailTradeoff = requiredElement<HTMLElement>(
  "#upgrade-detail-tradeoff",
);
const upgradeConfirm = requiredElement<HTMLButtonElement>("#upgrade-confirm");
const gameOverMenu = requiredElement<HTMLDivElement>("#game-over-menu");
const retryButton = requiredElement<HTMLButtonElement>("#retry-button");
const gameOverMainMenuButton = requiredElement<HTMLButtonElement>(
  "#game-over-main-menu-button",
);
const bossHealth = requiredElement<HTMLDivElement>("#boss-health");
const bossHealthName = requiredElement<HTMLSpanElement>("#boss-health-name");
const bossHealthValue = requiredElement<HTMLSpanElement>("#boss-health-value");
const bossHealthFill = requiredElement<HTMLDivElement>("#boss-health-fill");
const fps = requiredElement<HTMLDivElement>("#fps");
const hud = requiredElement<HTMLDivElement>("#hud");
const mainMenu = requiredElement<HTMLDivElement>("#main-menu");
const pauseMenu = requiredElement<HTMLDivElement>("#pause-menu");
const controlsMenu = requiredElement<HTMLDivElement>("#controls-menu");
const settingsMenu = requiredElement<HTMLDivElement>("#settings-menu");
const startButton = requiredElement<HTMLButtonElement>("#start-button");
const startSettingsButton = requiredElement<HTMLButtonElement>(
  "#start-settings-button",
);
const continueButton = requiredElement<HTMLButtonElement>("#continue-button");
const controlsButton = requiredElement<HTMLButtonElement>("#controls-button");
const settingsButton = requiredElement<HTMLButtonElement>("#settings-button");
const settingsBackButton = requiredElement<HTMLButtonElement>("#settings-back");
const renderScaleSelect = requiredElement<HTMLSelectElement>("#render-scale");
const renderResolution = requiredElement<HTMLElement>("#render-resolution");
const antiAliasingInput = requiredElement<HTMLInputElement>("#anti-aliasing");
const targetingReticleInput =
  requiredElement<HTMLInputElement>("#targeting-reticle");
const masterVolumeInput = requiredElement<HTMLInputElement>("#master-volume");
const masterVolumeValue = requiredElement<HTMLOutputElement>(
  "#master-volume-value",
);
const controlsBackButton = requiredElement<HTMLButtonElement>("#controls-back");
const mainMenuButton = requiredElement<HTMLButtonElement>("#main-menu-button");
const fixedDt = 1 / 60;
const LEVEL_INTRO_DURATION_MS = 4_200;
const LEVEL_OUTRO_DURATION_MS = 3_800;
const REDUCED_MOTION_INTRO_DURATION_MS = 700;
const REDUCED_MOTION_OUTRO_DURATION_MS = 900;
let previous = performance.now();
let accumulator = 0;
let levelIntroStartedAt: number | null = null;
let levelOutroStartedAt: number | null = null;
let levelResultsVisible = false;
let activeUpgrades: UpgradeId[] = [];
let pendingUpgradeCarry: CampaignCarry | null = null;
let previewedUpgradeId: UpgradeId | null = null;
let levelStats = createLevelStats();
type RunMode = "standard" | "boss" | "transition-tour";
let runMode: RunMode = "standard";
let activeEnemyPlan: LevelEnemyPlan = LEVELS[1].enemies;
const lifecycle = new GameLifecycle();
let closeDevOverlay: (() => void) | null = null;
type DevSettingName =
  | "invulnerable"
  | "showFps"
  | "showMovementFrame"
  | "showSpline"
  | "agxToneMapping";
type DevSettings = Record<DevSettingName, boolean>;
const devSettings: DevSettings = {
  invulnerable: false,
  showFps: false,
  showMovementFrame: false,
  showSpline: false,
  agxToneMapping: false,
};
let fpsFrames = 0;
let fpsElapsed = 0;
let loading = false;
let retryLoad: (() => void) | null = null;
let settingsSource = {
  menu: pauseMenu,
  button: settingsButton,
};
const MENU_EXIT_DURATION_MS = 320;
const menuTransitionTimers = new WeakMap<HTMLElement, number>();

function clearMenuTransition(menu: HTMLElement) {
  const timer = menuTransitionTimers.get(menu);
  if (timer !== undefined) window.clearTimeout(timer);
  menuTransitionTimers.delete(menu);
}

function resetMenuState(menu: HTMLElement) {
  menu.classList.remove("menu--ancestor", "menu--entering", "menu--leaving");
  menu.inert = false;
  menu.removeAttribute("aria-hidden");
}

function hideMenuImmediately(menu: HTMLElement) {
  clearMenuTransition(menu);
  menu.hidden = true;
  resetMenuState(menu);
}

function showMenu(menu: HTMLElement) {
  clearMenuTransition(menu);
  resetMenuState(menu);
  menu.hidden = false;
  menu.classList.add("menu--entering");
  const timer = window.setTimeout(() => {
    menu.classList.remove("menu--entering");
    menuTransitionTimers.delete(menu);
  }, 440);
  menuTransitionTimers.set(menu, timer);
}

function hideMenu(menu: HTMLElement) {
  if (menu.hidden || menu.classList.contains("menu--leaving")) return;
  clearMenuTransition(menu);
  menu.classList.remove("menu--entering");
  menu.classList.add("menu--leaving");
  menu.inert = true;
  const timer = window.setTimeout(() => {
    menu.hidden = true;
    resetMenuState(menu);
    menuTransitionTimers.delete(menu);
  }, MENU_EXIT_DURATION_MS);
  menuTransitionTimers.set(menu, timer);
}

function openMenuChild(
  parent: HTMLElement,
  child: HTMLElement,
  childFocus: HTMLElement,
) {
  clearMenuTransition(parent);
  parent.hidden = false;
  parent.classList.remove("menu--entering", "menu--leaving");
  parent.classList.add("menu--ancestor");
  parent.inert = true;
  parent.setAttribute("aria-hidden", "true");
  showMenu(child);
  childFocus.focus();
}

function closeMenuChild(
  child: HTMLElement,
  parent: HTMLElement,
  parentFocus: HTMLElement,
) {
  if (child.hidden || child.classList.contains("menu--leaving")) return;
  hideMenu(child);
  clearMenuTransition(parent);
  resetMenuState(parent);
  parent.hidden = false;
  parentFocus.focus();
}

function applyDevSettings() {
  fps.hidden = !devSettings.showFps;
  view.setAgXToneMapping(devSettings.agxToneMapping);
  view.setDebugVisibility(
    devSettings.showMovementFrame,
    devSettings.showSpline,
  );
  document
    .querySelectorAll<HTMLInputElement>("[data-dev-setting]")
    .forEach((input) => {
      input.checked = devSettings[input.dataset.devSetting as DevSettingName];
    });
}

function styleForLevel(levelNumber: number): LevelId {
  return LEVEL_IDS[(levelNumber - 1) % LEVEL_IDS.length];
}

function startRun(levelNumber: LevelId, mode: RunMode = "standard") {
  runMode = mode;
  activeUpgrades = [];
  void startGame(levelNumber);
}

async function startGame(levelNumber = 1, carry?: CampaignCarry) {
  if (loading) return;
  input.setEnabled(false);
  loading = true;
  const isNewRun = !carry;
  showLoading(levelNumber, isNewRun);
  try {
    const audioLoad = audio.preload();
    const levelId = styleForLevel(levelNumber);
    const assets = await withTimeout(
      loadGameAssets(levelId, updateLoadingProgress),
      60_000,
      "Timed out while loading level assets.",
    );
    await withTimeout(audioLoad, 20_000, "Timed out while loading audio.");
    await nextPaint();
    currentLevelNumber = levelNumber;
    const level = LEVELS[levelId];
    activeUpgrades = [...(carry?.upgrades ?? [])];
    const quickBossEncounter = runMode !== "standard";
    activeEnemyPlan = quickBossEncounter
      ? createTransitionTourPlan(level.enemies)
      : level.enemies;
    const world = createWorld(level.systems);
    view.dispose();
    simulation = new FlightSimulation({
      ...carry,
      level: currentLevelNumber,
      enemyPlan: activeEnemyPlan,
      oneShotEnemies: quickBossEncounter,
      world,
      events: flightEvents,
      upgrades: activeUpgrades,
    });
    levelStats = createLevelStats(simulation.score);
    view = new GameView(appRoot, level, world, assets);
    view.setRenderScale(Number(renderScaleSelect.value));
    view.setAntiAliasing(antiAliasingInput.checked);
    view.setReticleVisible(targetingReticleInput.checked);
    applyDevSettings();
    lifecycle.startIntro();
    document
      .querySelectorAll<HTMLElement>(".menu")
      .forEach(hideMenuImmediately);
    closeDevOverlay = null;
    hud.hidden = true;
    showLevelIntro(level, levelNumber);
    view.setReticleVisible(false);
    damageVignette.classList.remove("damage-vignette--active");
    levelTransition.className = "level-transition";
    hideLevelResults();
    hideUpgradeSelection();
    accumulator = 0;
    previous = performance.now();
    updateRenderResolution();
    hideLoading();
  } catch (error) {
    console.error("Unable to start level", error);
    showLoadingError();
    retryLoad = () => {
      void startGame(levelNumber, carry);
    };
  } finally {
    loading = false;
  }
}

function pauseGame() {
  if (!lifecycle.pause()) return;
  input.setEnabled(false);
  showMenu(pauseMenu);
  continueButton.focus();
}

function continueGame() {
  if (!lifecycle.resume()) return;
  input.setEnabled(true);
  hideMenu(pauseMenu);
  accumulator = 0;
}

function returnToMainMenu() {
  lifecycle.returnToMenu();
  input.setEnabled(false);
  hideLevelIntro();
  hideLevelResults();
  document.querySelectorAll<HTMLElement>(".menu").forEach(hideMenuImmediately);
  showMenu(mainMenu);
  hud.hidden = true;
  startButton.focus();
}

function openControls() {
  openMenuChild(pauseMenu, controlsMenu, controlsBackButton);
}

function closeControls() {
  closeMenuChild(controlsMenu, pauseMenu, controlsButton);
}

function updateRenderResolution() {
  const resolution = view.getRenderResolution();
  renderResolution.textContent = `${resolution.width} × ${resolution.height}`;
}

function openSettings(
  sourceMenu: HTMLDivElement,
  sourceButton: HTMLButtonElement,
) {
  settingsSource = { menu: sourceMenu, button: sourceButton };
  openMenuChild(sourceMenu, settingsMenu, settingsBackButton);
}

function closeSettings() {
  closeMenuChild(settingsMenu, settingsSource.menu, settingsSource.button);
}

startButton.addEventListener("click", () => {
  startRun(1);
});
retryButton.addEventListener("click", () => {
  startRun(1);
});
loadingRetry.addEventListener("click", () => retryLoad?.());
levelResultsContinue.addEventListener("click", continueAfterLevelResults);
for (const button of upgradeButtons)
  button.addEventListener("click", () => {
    const upgradeId = button.dataset.upgradeId as UpgradeId | undefined;
    if (upgradeId) previewUpgrade(upgradeId);
  });
upgradeConfirm.addEventListener("click", () => {
  if (previewedUpgradeId) selectUpgrade(previewedUpgradeId);
});
gameOverMainMenuButton.addEventListener("click", returnToMainMenu);
continueButton.addEventListener("click", continueGame);
controlsButton.addEventListener("click", openControls);
startSettingsButton.addEventListener("click", () =>
  openSettings(mainMenu, startSettingsButton),
);
settingsButton.addEventListener("click", () =>
  openSettings(pauseMenu, settingsButton),
);
settingsBackButton.addEventListener("click", closeSettings);
controlsBackButton.addEventListener("click", closeControls);
mainMenuButton.addEventListener("click", returnToMainMenu);
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (
    event.code === "Space" &&
    lifecycle.mode === "outro" &&
    levelResultsVisible
  ) {
    event.preventDefault();
    continueAfterLevelResults();
    return;
  }
  if (event.code !== "Escape") return;
  if (!controlsMenu.hidden) {
    closeControls();
    return;
  }
  if (!settingsMenu.hidden) {
    closeSettings();
    return;
  }
  const devMenuOpen = document.querySelector<HTMLElement>(
    "#dev-menu:not([hidden]), #dev-settings-menu:not([hidden]), #dev-level-menu:not([hidden]), #dev-pickup-menu:not([hidden]), #asset-scaling-menu:not([hidden])",
  );
  if (devMenuOpen && closeDevOverlay) {
    closeDevOverlay();
    return;
  }
  if (lifecycle.mode === "playing") pauseGame();
  else if (lifecycle.mode === "paused") continueGame();
});

const storedRenderScale = Number(localStorage.getItem("exowing.renderScale"));
const initialRenderScale = [0.5, 0.75, 1].includes(storedRenderScale)
  ? storedRenderScale
  : 1;
const antiAliasingEnabled =
  localStorage.getItem("exowing.antiAliasing") !== "false";
const targetingReticleEnabled =
  localStorage.getItem("exowing.targetingReticle") !== "false";
const storedMasterVolume = localStorage.getItem("exowing.masterVolume");
const parsedMasterVolume =
  storedMasterVolume === null ? NaN : Number(storedMasterVolume);
const initialMasterVolume = Number.isFinite(parsedMasterVolume)
  ? Math.max(0, Math.min(1, parsedMasterVolume))
  : DEFAULT_AUDIO_SETTINGS.masterVolume;
renderScaleSelect.value = initialRenderScale.toString();
antiAliasingInput.checked = antiAliasingEnabled;
targetingReticleInput.checked = targetingReticleEnabled;
applyMasterVolume(initialMasterVolume);
view.setRenderScale(initialRenderScale);
view.setAntiAliasing(antiAliasingEnabled);
view.setReticleVisible(targetingReticleEnabled);
updateRenderResolution();
renderScaleSelect.addEventListener("change", () => {
  const scale = Number(renderScaleSelect.value);
  view.setRenderScale(scale);
  updateRenderResolution();
  try {
    localStorage.setItem("exowing.renderScale", scale.toString());
  } catch {
    /* Persistence is optional. */
  }
});
antiAliasingInput.addEventListener("change", () => {
  view.setAntiAliasing(antiAliasingInput.checked);
  try {
    localStorage.setItem(
      "exowing.antiAliasing",
      antiAliasingInput.checked.toString(),
    );
  } catch {
    /* Persistence is optional. */
  }
});
targetingReticleInput.addEventListener("change", () => {
  view.setReticleVisible(targetingReticleInput.checked);
  try {
    localStorage.setItem(
      "exowing.targetingReticle",
      targetingReticleInput.checked.toString(),
    );
  } catch {
    /* Persistence is optional. */
  }
});
masterVolumeInput.addEventListener("input", () => {
  applyMasterVolume(Number(masterVolumeInput.value));
});
masterVolumeInput.addEventListener("change", () => {
  try {
    localStorage.setItem("exowing.masterVolume", masterVolumeInput.value);
  } catch {
    /* Persistence is optional. */
  }
});
window.addEventListener("resize", updateRenderResolution);

function applyMasterVolume(volume: number) {
  const normalized = Math.max(0, Math.min(1, volume));
  masterVolumeInput.value = normalized.toString();
  masterVolumeValue.value = `${Math.round(normalized * 100)}%`;
  audio.applySettings({
    ...DEFAULT_AUDIO_SETTINGS,
    masterVolume: normalized,
  });
}

if (import.meta.env.DEV) setupDevControls();

// Test/development shortcuts: ?play=3&dev=invulnerable and ?play=3&preview=outro
const query = new URLSearchParams(location.search);
const requestedLevel = levelFromQuery(query.get("play"));
const previewOutro = import.meta.env.DEV && query.get("preview") === "outro";
if (requestedLevel) void startGame(requestedLevel);
else startButton.focus();

function frame(now: number) {
  performanceRecorder.frame(
    now,
    {
      level: currentLevelNumber,
      enemies: simulation.enemies.length,
      projectiles: simulation.projectiles.length,
      mode: lifecycle.mode,
    },
    () => updateFrame(now),
  );
  requestAnimationFrame(frame);
}

function updateFrame(now: number) {
  const frameDt = Math.min((now - previous) / 1000, 0.1);
  accumulator += frameDt;
  previous = now;
  performanceRecorder.span("simulation.step", () => {
    while (lifecycle.mode === "playing" && accumulator >= fixedDt) {
      simulation.invulnerable =
        runMode !== "standard" || devSettings.invulnerable;
      const overshieldBeforeStep = simulation.player.overshield;
      const protectionBeforeStep =
        simulation.player.shield + simulation.player.overshield;
      const result = simulation.step(input.command(), fixedDt);
      recordLevelStep(
        levelStats,
        result,
        fixedDt,
        Math.max(
          0,
          protectionBeforeStep -
            simulation.player.shield -
            simulation.player.overshield,
        ),
      );
      if (result.playerHits > 0) {
        flashDamageVignette();
        if (overshieldBeforeStep > 0) view.flashOvershieldHit();
      }
      if (result.levelComplete) beginLevelOutro();
      else if (simulation.player.shield <= 0) showGameOver();
      accumulator -= fixedDt;
    }
  });
  const introProgress = updateLevelIntro(now);
  const outroProgress = updateLevelOutro(now);
  const sequence: GameViewSequence | undefined =
    introProgress !== undefined
      ? { kind: "intro", progress: introProgress }
      : outroProgress !== undefined
        ? { kind: "outro", ...outroProgress }
        : undefined;
  if (score) score.textContent = simulation.score.toString().padStart(4, "0");
  const shieldPercent =
    (simulation.player.shield / simulation.player.maxShield) * 100;
  shield.textContent = `${Math.round(shieldPercent)}%`;
  shieldFill.style.width = `${shieldPercent}%`;
  shieldFill.classList.toggle(
    "hud__shield-fill--critical",
    simulation.player.shield <= 2,
  );
  shieldTrack.setAttribute(
    "aria-valuenow",
    simulation.player.shield.toString(),
  );
  shieldTrack.setAttribute(
    "aria-valuemax",
    simulation.player.maxShield.toString(),
  );
  missileAmmo.textContent = simulation.player.homingMissiles.toString();
  const lockCount = simulation.player.missileLockTargetIds.length;
  missileLocks.textContent =
    lockCount > 0
      ? `${lockCount} / ${simulation.missileLockLimit} LOCKED`
      : simulation.player.homingMissiles > 0
        ? "HOLD F TO LOCK"
        : "RACK EMPTY";
  const heldPickup = simulation.player.heldPickup;
  pickupReserve.textContent = heldPickup
    ? PICKUPS[heldPickup].label.toUpperCase()
    : "EMPTY";
  const activePickup = simulation.activePickup;
  pickupStatus.textContent = activePickup
    ? `ACTIVE: ${PICKUPS[activePickup.pickupId].label.toUpperCase()} ${Math.ceil(activePickup.timeRemaining)}S`
    : heldPickup
      ? "PRESS R TO ACTIVATE"
      : "NO PICKUP HELD";
  const boss = simulation.boss;
  const bossEngaged = boss && boss.railDistance - simulation.railDistance < 140;
  bossHealth.hidden = !bossEngaged;
  if (boss) {
    bossHealthName.textContent = `GUARDIAN: ${ENEMIES[boss.enemyId].label.toUpperCase()}`;
    const bossPercent = Math.max(
      0,
      ((boss.health ?? 0) / (boss.maxHealth ?? 1)) * 100,
    );
    bossHealthValue.textContent = `${Math.ceil(bossPercent)}%`;
    bossHealthFill.style.width = `${bossPercent}%`;
  }
  if (devSettings.showFps) {
    fpsFrames++;
    fpsElapsed += frameDt;
    if (fpsElapsed >= 0.5) {
      fps.textContent = `FPS ${Math.round(fpsFrames / fpsElapsed)}`;
      fpsFrames = 0;
      fpsElapsed = 0;
    }
  }
  if (lifecycle.shouldRender())
    performanceRecorder.span("view.render", () =>
      view.sync(simulation, sequence),
    );
}

requestAnimationFrame(frame);

function flashDamageVignette() {
  damageVignette.classList.remove("damage-vignette--active");
  void damageVignette.offsetWidth;
  damageVignette.classList.add("damage-vignette--active");
}

function showGameOver() {
  if (!lifecycle.gameOver()) return;
  input.setEnabled(false);
  hud.hidden = true;
  showMenu(gameOverMenu);
  retryButton.focus();
}

function showLevelIntro(level: (typeof LEVELS)[LevelId], levelNumber: number) {
  levelIntroEyebrow.textContent = `LEVEL ${levelNumber.toString().padStart(2, "0")}`;
  levelIntroTitle.textContent = level.name.toUpperCase();
  levelIntro.hidden = false;
  levelIntro.classList.remove("level-intro--active");
  void levelIntro.offsetWidth;
  levelIntro.classList.add("level-intro--active");
  levelIntroStartedAt = performance.now();
}

function updateLevelIntro(now: number): number | undefined {
  if (lifecycle.mode !== "intro" || levelIntroStartedAt === null)
    return undefined;
  const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? REDUCED_MOTION_INTRO_DURATION_MS
    : LEVEL_INTRO_DURATION_MS;
  const progress = Math.min(1, (now - levelIntroStartedAt) / duration);
  if (progress < 1) return progress;

  lifecycle.finishIntro();
  input.setEnabled(true);
  hideLevelIntro();
  accumulator = 0;
  previous = now;
  if (previewOutro) {
    beginLevelOutro();
    return 1;
  }
  hud.hidden = false;
  view.setReticleVisible(targetingReticleInput.checked);
  return 1;
}

function hideLevelIntro() {
  levelIntro.hidden = true;
  levelIntro.classList.remove("level-intro--active");
  levelIntroStartedAt = null;
}

function beginLevelOutro() {
  if (!lifecycle.beginOutro()) return;
  input.setEnabled(false);
  hud.hidden = true;
  bossHealth.hidden = true;
  view.setReticleVisible(false);
  levelOutroStartedAt = performance.now();
  levelResultsVisible = false;
  accumulator = 0;
}

function updateLevelOutro(
  now: number,
):
  | { progress: number; elapsedSeconds: number; durationSeconds: number }
  | undefined {
  if (
    levelOutroStartedAt === null ||
    (lifecycle.mode !== "outro" && lifecycle.mode !== "transition")
  )
    return undefined;
  const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? REDUCED_MOTION_OUTRO_DURATION_MS
    : LEVEL_OUTRO_DURATION_MS;
  const durationSeconds = duration / 1000;
  if (lifecycle.mode === "transition")
    return {
      progress: 1,
      elapsedSeconds: durationSeconds,
      durationSeconds,
    };
  const elapsedSeconds = Math.max(0, (now - levelOutroStartedAt) / 1000);
  const progress = Math.min(1, elapsedSeconds / durationSeconds);
  if (progress === 1 && !levelResultsVisible) showLevelResults();
  return { progress, elapsedSeconds, durationSeconds };
}

function showLevelResults() {
  const level = LEVELS[styleForLevel(currentLevelNumber)];
  const summary = summarizeLevelStats(
    levelStats,
    activeEnemyPlan,
    simulation.score,
  );
  levelResultsTitle.textContent = `${level.name.toUpperCase()} CLEARED`;
  levelResultsKillPercent.textContent = `${summary.killPercent}%`;
  levelResultsEnemies.textContent = `${summary.enemiesKilled} / ${summary.totalEnemies}`;
  levelResultsAccuracy.textContent = `${summary.accuracyPercent}%`;
  levelResultsShots.textContent = summary.shotsFired.toString();
  levelResultsDamage.textContent = formatResultNumber(summary.damageTaken);
  levelResultsTime.textContent = formatFlightTime(summary.elapsedSeconds);
  levelResultsScore.textContent = summary.scoreEarned
    .toString()
    .padStart(4, "0");
  levelResults.hidden = false;
  levelResults.className = "level-results";
  void levelResults.offsetWidth;
  levelResults.classList.add("level-results--visible");
  levelResultsVisible = true;
  levelResultsContinue.focus();
}

function continueAfterLevelResults() {
  if (!levelResultsVisible || !lifecycle.finishOutro()) return;
  const nextLevel = currentLevelNumber + 1;
  const carry: CampaignCarry = {
    shield: simulation.player.shield,
    score: simulation.score,
    homingMissiles: simulation.player.homingMissiles,
    heldPickup: simulation.player.heldPickup,
    upgrades: [...activeUpgrades],
  };
  if (runMode === "standard" && hasUpgradeAfterLevel(currentLevelNumber)) {
    showUpgradeSelection(carry);
    return;
  }
  transitionToNextLevel(nextLevel, carry);
}

function showUpgradeSelection(carry: CampaignCarry) {
  pendingUpgradeCarry = carry;
  previewedUpgradeId = null;
  levelResults.hidden = true;
  levelResultsVisible = false;
  renderUpgradeTree(carry.upgrades);
  const nextLevel = LEVELS[styleForLevel(currentLevelNumber + 1)];
  upgradeNextLevel.textContent = `NEXT SORTIE: ${nextLevel.name.toUpperCase()}`;
  const remainingAfterThis = Math.max(0, 5 - currentLevelNumber);
  upgradePointsRemaining.textContent =
    remainingAfterThis === 1
      ? "1 UPGRADE REMAINS AFTER THIS"
      : `${remainingAfterThis} UPGRADES REMAIN AFTER THIS`;
  upgradeScreen.hidden = false;
  const firstAvailable = availableUpgrades(carry.upgrades)[0];
  if (!firstAvailable) return;
  previewUpgrade(firstAvailable);
  upgradeButtons
    .find((button) => button.dataset.upgradeId === firstAvailable)
    ?.focus();
}

function renderUpgradeTree(selectedUpgrades: readonly UpgradeId[]) {
  for (const button of upgradeButtons) {
    const upgradeId = button.dataset.upgradeId as UpgradeId;
    const status = upgradeStatus(upgradeId, selectedUpgrades);
    button.dataset.upgradeStatus = status;
    button.setAttribute(
      "aria-pressed",
      (upgradeId === previewedUpgradeId).toString(),
    );
    button.classList.toggle(
      "upgrade-node--previewed",
      upgradeId === previewedUpgradeId,
    );
    const state = button.querySelector<HTMLElement>(
      "[data-upgrade-node-state]",
    );
    if (state)
      state.textContent = upgradeStatusLabel(
        upgradeId,
        status,
        selectedUpgrades,
      );
  }
}

function previewUpgrade(upgradeId: UpgradeId) {
  if (!pendingUpgradeCarry) return;
  previewedUpgradeId = upgradeId;
  renderUpgradeTree(pendingUpgradeCarry.upgrades);
  const definition = UPGRADES[upgradeId];
  const status = upgradeStatus(upgradeId, pendingUpgradeCarry.upgrades);
  upgradeDetailState.textContent = upgradeStatusLabel(
    upgradeId,
    status,
    pendingUpgradeCarry.upgrades,
  );
  upgradeDetailLabel.textContent = definition.label.toUpperCase();
  upgradeDetailEffect.textContent = definition.detail;
  const unlocked = upgradesUnlockedBy(upgradeId).map(
    (candidate) => UPGRADES[candidate].label,
  );
  upgradeDetailUnlocks.textContent =
    unlocked.length > 0
      ? unlocked.join(" or ")
      : "Final specialization upgrade.";
  upgradeDetailTradeoff.textContent =
    definition.tradeoff ?? "Commits one upgrade point.";
  upgradeConfirm.disabled = status !== "available";
  upgradeConfirm.textContent =
    status === "available"
      ? `INSTALL ${definition.label.toUpperCase()}`
      : upgradeStatusLabel(upgradeId, status, pendingUpgradeCarry.upgrades);
}

function upgradeStatusLabel(
  upgradeId: UpgradeId,
  status: ReturnType<typeof upgradeStatus>,
  selectedUpgrades: readonly UpgradeId[],
) {
  const definition = UPGRADES[upgradeId];
  switch (status) {
    case "selected":
      return "INSTALLED";
    case "available":
      return "AVAILABLE";
    case "excluded": {
      const selectedExclusion = definition.excludes?.find((excluded) =>
        selectedUpgrades.includes(excluded),
      );
      return selectedExclusion
        ? `LOCKED BY ${UPGRADES[selectedExclusion].label.toUpperCase()}`
        : "EXCLUDED";
    }
    case "locked": {
      const requirements = definition.requirements ?? [];
      const labels = requirements.map((required) =>
        UPGRADES[required].label.toUpperCase(),
      );
      return labels.length > 0
        ? `REQUIRES ${labels.join(definition.requirementMode === "any" ? " OR " : " + ")}`
        : "LOCKED";
    }
  }
}

function selectUpgrade(upgradeId: UpgradeId) {
  if (!pendingUpgradeCarry) return;
  if (upgradeStatus(upgradeId, pendingUpgradeCarry.upgrades) !== "available")
    return;
  const carry = pendingUpgradeCarry;
  pendingUpgradeCarry = null;
  carry.upgrades = [...carry.upgrades, upgradeId];
  if (upgradeId === "reinforced-shield")
    carry.shield = Math.min(6, carry.shield + 1);
  activeUpgrades = [...carry.upgrades];
  hideUpgradeSelection();
  transitionToNextLevel(currentLevelNumber + 1, carry);
}

function transitionToNextLevel(nextLevel: number, carry: CampaignCarry) {
  levelResults.classList.add("level-results--leaving");
  levelTransitionLabel.textContent = "";
  levelTransition.className = "level-transition level-transition--active";
  window.setTimeout(() => {
    void startGame(nextLevel, carry);
  }, 900);
}

function hideUpgradeSelection() {
  upgradeScreen.hidden = true;
  pendingUpgradeCarry = null;
  previewedUpgradeId = null;
}

function hideLevelResults() {
  levelResults.hidden = true;
  levelResults.className = "level-results";
  levelResultsVisible = false;
  levelOutroStartedAt = null;
}

function formatFlightTime(elapsedSeconds: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatResultNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function showLoading(levelNumber: number, isNewRun: boolean) {
  const level = LEVELS[styleForLevel(levelNumber)];
  retryLoad = null;
  hideLevelIntro();
  hideLevelResults();
  loadingScreen.className = isNewRun
    ? "loading-screen"
    : "loading-screen loading-screen--transition";
  loadingScreen.hidden = false;
  loadingEyebrow.textContent = `LEVEL ${levelNumber.toString().padStart(2, "0")}`;
  loadingTitle.textContent = level.name.toUpperCase();
  loadingStatus.textContent = "LOADING";
  loadingFill.style.width = "0%";
  loadingRetry.hidden = true;
  startButton.disabled = true;
  hud.hidden = true;
}

function updateLoadingProgress(progress: AssetLoadProgress) {
  loadingFill.style.width = `${progress.total ? (progress.loaded / progress.total) * 100 : 0}%`;
}

function hideLoading() {
  const revealLevel = loadingScreen.classList.contains(
    "loading-screen--transition",
  );
  loadingScreen.hidden = true;
  loadingScreen.className = "loading-screen";
  levelTransition.className = revealLevel
    ? "level-transition level-transition--reveal"
    : "level-transition";
  startButton.disabled = false;
  retryLoad = null;
}

function showLoadingError() {
  loadingScreen.classList.add("loading-screen--error");
  loadingEyebrow.textContent = "LOAD FAILED";
  loadingStatus.textContent = "UNABLE TO LOAD LEVEL";
  loadingRetry.hidden = false;
  startButton.disabled = false;
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function setupDevControls() {
  const pauseMenuButton = requiredElement<HTMLButtonElement>(
    "#dev-settings-button",
  );
  const startMenuButton = requiredElement<HTMLButtonElement>(
    "#start-dev-settings-button",
  );
  const devMenu = requiredElement<HTMLDivElement>("#dev-menu");
  const devMenuBack = requiredElement<HTMLButtonElement>("#dev-menu-back");
  const openSettingsButton =
    requiredElement<HTMLButtonElement>("#open-dev-settings");
  const transitionTourButton = requiredElement<HTMLButtonElement>(
    "#start-transition-tour",
  );
  const bossEncounterButton = requiredElement<HTMLButtonElement>(
    "#start-boss-encounter",
  );
  const openLevelSwitcherButton = requiredElement<HTMLButtonElement>(
    "#open-level-switcher",
  );
  const openAssetScalingButton = requiredElement<HTMLButtonElement>(
    "#open-asset-scaling",
  );
  const openPickupSpawnerButton = requiredElement<HTMLButtonElement>(
    "#open-pickup-spawner",
  );
  const settingsMenu = requiredElement<HTMLDivElement>("#dev-settings-menu");
  const backButton = requiredElement<HTMLButtonElement>("#dev-settings-back");
  const levelMenu = requiredElement<HTMLDivElement>("#dev-level-menu");
  const levelBack = requiredElement<HTMLButtonElement>("#dev-level-back");
  const pickupMenu = requiredElement<HTMLDivElement>("#dev-pickup-menu");
  const pickupBack = requiredElement<HTMLButtonElement>("#dev-pickup-back");
  const pickupList = requiredElement<HTMLDivElement>("#dev-pickup-list");
  const assetScalingMenu = requiredElement<HTMLDivElement>(
    "#asset-scaling-menu",
  );
  const assetScalingBack = requiredElement<HTMLButtonElement>(
    "#asset-scaling-back",
  );
  const levelList = requiredElement<HTMLDivElement>("#dev-level-list");
  let assetScaleTool: { refresh: () => void } | undefined;
  let closeRootMenu: (() => void) | undefined;

  function openMenu(
    sourceMenu: HTMLDivElement,
    sourceButton: HTMLButtonElement,
  ) {
    openMenuChild(sourceMenu, devMenu, devMenuBack);
    closeRootMenu = () => {
      closeMenuChild(devMenu, sourceMenu, sourceButton);
      closeDevOverlay = null;
      closeRootMenu = undefined;
    };
    closeDevOverlay = closeRootMenu;
  }

  function openSubmenu(
    submenu: HTMLDivElement,
    sourceButton: HTMLButtonElement,
    back: HTMLButtonElement,
  ) {
    openMenuChild(devMenu, submenu, back);
    closeDevOverlay = () => {
      closeMenuChild(submenu, devMenu, sourceButton);
      closeDevOverlay = closeRootMenu ?? null;
    };
  }

  pauseMenuButton.addEventListener("click", () =>
    openMenu(pauseMenu, pauseMenuButton),
  );
  startMenuButton.addEventListener("click", () =>
    openMenu(mainMenu, startMenuButton),
  );
  devMenuBack.addEventListener("click", () => closeDevOverlay?.());
  bossEncounterButton.addEventListener("click", () =>
    startRun(styleForLevel(currentLevelNumber), "boss"),
  );
  transitionTourButton.addEventListener("click", () =>
    startRun(1, "transition-tour"),
  );
  openSettingsButton.addEventListener("click", () =>
    openSubmenu(settingsMenu, openSettingsButton, backButton),
  );
  openLevelSwitcherButton.addEventListener("click", () =>
    openSubmenu(levelMenu, openLevelSwitcherButton, levelBack),
  );
  openPickupSpawnerButton.addEventListener("click", () =>
    openSubmenu(pickupMenu, openPickupSpawnerButton, pickupBack),
  );
  openAssetScalingButton.addEventListener("click", () => {
    openSubmenu(assetScalingMenu, openAssetScalingButton, assetScalingBack);
    if (assetScaleTool) {
      assetScaleTool.refresh();
      return;
    }
    void import("./dev/assetScaleTool").then(({ mountAssetScaleTool }) => {
      assetScaleTool = mountAssetScaleTool();
    });
  });
  backButton.addEventListener("click", () => closeDevOverlay?.());
  levelBack.addEventListener("click", () => closeDevOverlay?.());
  pickupBack.addEventListener("click", () => closeDevOverlay?.());
  assetScalingBack.addEventListener("click", () => closeDevOverlay?.());
  levelList
    .querySelectorAll<HTMLButtonElement>("[data-dev-level]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const levelId = Number(button.dataset.devLevel) as LevelId;
        startRun(levelId);
      });
    });
  pickupList
    .querySelectorAll<HTMLButtonElement>("[data-dev-pickup]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        spawnDevPickup(button.dataset.devPickup as PickupId);
      });
    });
  document
    .querySelectorAll<HTMLInputElement>("[data-dev-setting]")
    .forEach((input) => {
      input.addEventListener("change", () => {
        devSettings[input.dataset.devSetting as DevSettingName] = input.checked;
        applyDevSettings();
      });
    });

  const aliases: Record<string, DevSettingName> = {
    invulnerable: "invulnerable",
    fps: "showFps",
    frame: "showMovementFrame",
    spline: "showSpline",
    agx: "agxToneMapping",
  };
  const requested =
    new URLSearchParams(location.search).get("dev")?.split(",") ?? [];
  for (const alias of requested)
    if (aliases[alias]) devSettings[aliases[alias]] = true;

  window.exowingDev = {
    settings: devSettings,
    set(name, enabled = true) {
      devSettings[name] = enabled;
      applyDevSettings();
    },
    start(levelId = 1, overrides = {}) {
      Object.assign(devSettings, overrides);
      applyDevSettings();
      startRun(levelId);
    },
    transitionTour() {
      startRun(1, "transition-tour");
    },
    boss(levelId = styleForLevel(currentLevelNumber)) {
      startRun(levelId, "boss");
    },
    spawnPickup(pickupId) {
      spawnDevPickup(pickupId);
    },
  };
  applyDevSettings();
}

function spawnDevPickup(pickupId: PickupId) {
  simulation.spawnPickup(
    pickupId,
    view.positionAlongCameraForward(simulation.railSpeed),
  );
}

declare global {
  interface Window {
    exowingPerformance?: {
      enabled: boolean;
      reset: typeof performanceRecorder.reset;
      summary: typeof performanceRecorder.summary;
      exportData: typeof performanceRecorder.exportData;
    };
    exowingDev?: {
      settings: DevSettings;
      set: (name: DevSettingName, enabled?: boolean) => void;
      start: (levelId?: LevelId, overrides?: Partial<DevSettings>) => void;
      transitionTour: () => void;
      boss: (levelId?: LevelId) => void;
      spawnPickup: (pickupId: PickupId) => void;
    };
  }
}

function levelFromQuery(value: string | null): LevelId | null {
  if (!value) return null;
  const numeric = Number(value);
  if (LEVEL_IDS.includes(numeric as LevelId)) return numeric as LevelId;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    LEVEL_IDS.find(
      (id) =>
        LEVELS[id].name.toLowerCase().replace(/[^a-z0-9]+/g, "-") ===
        normalized,
    ) ?? null
  );
}
