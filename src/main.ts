import "./style.css";
import { InputState } from "./input/inputState";
import { LEVEL_IDS, LEVELS, type LevelId } from "./levels";
import { createWorld } from "./world/worldSystem";
import { FlightSimulation } from "./sim/flightSimulation";
import { GameView } from "./view/gameView";
import { loadGameAssets, type AssetLoadProgress } from "./assets/gameAssets";
import { mountAppShell, requiredElement } from "./ui/appShell";
import { GameLifecycle } from "./game/gameLifecycle";
import { performanceRecorder } from "./performance";
import { createAudioSystem, DEFAULT_AUDIO_SETTINGS } from "./audio";
import { FlightAudioFeedback } from "./game/flightAudioFeedback";
import { FlightEventBus } from "./game/flightEvents";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing app root");
const appRoot = app;

/*
app.innerHTML = `
  <div class="menu" id="main-menu">
    <h1 class="menu__title">EXOWING</h1>
    <div class="menu__actions">
      <button id="start-button" type="button">START</button>
      ${import.meta.env.DEV ? '<button id="start-dev-settings-button" type="button">DEV SETTINGS</button>' : ''}
    </div>
  </div>
  <div class="menu" id="pause-menu" hidden>
    <h1 class="menu__title">PAUSED</h1>
    <div class="menu__actions">
      <button id="continue-button" type="button">CONTINUE</button>
      <button id="settings-button" type="button">SETTINGS</button>
      <button id="controls-button" type="button">CONTROLS</button>
      <button id="main-menu-button" type="button">MAIN MENU</button>
      ${import.meta.env.DEV ? '<button id="dev-settings-button" type="button">DEV SETTINGS</button>' : ''}
    </div>
  </div>
  <div class="menu" id="settings-menu" hidden>
    <button class="menu__back" id="settings-back" type="button">BACK</button>
    <div class="settings">
      <h1>SETTINGS</h1>
      <div class="setting-row">
        <div><span>GRAPHICS</span><small id="render-resolution"></small></div>
        <select id="render-scale" aria-label="Graphics quality">
          <option value="0.5">LOW</option>
          <option value="0.75">MEDIUM</option>
          <option value="1">HIGH</option>
        </select>
      </div>
      <label class="setting-row setting-toggle">
        <span>ANTI-ALIASING</span>
        <input id="anti-aliasing" type="checkbox">
      </label>
    </div>
  </div>
  <div class="menu" id="controls-menu" hidden>
    <button class="menu__back" id="controls-back" type="button">BACK</button>
    <div class="controls">
      <h1>CONTROLS</h1>
      <dl>
        <div><dt>MOVE</dt><dd>W A S D</dd></div>
        <div><dt>BARREL ROLL / DODGE</dt><dd>Q / E</dd></div>
        <div><dt>FIRE</dt><dd>SPACE</dd></div>
        <div><dt>FASTER</dt><dd>SHIFT</dd></div>
        <div><dt>BRAKE</dt><dd>ALT</dd></div>
        <div><dt>PAUSE</dt><dd>ESC</dd></div>
      </dl>
    </div>
  </div>
  ${import.meta.env.DEV ? `
    <div class="menu" id="dev-settings-menu" hidden>
      <button class="menu__back" id="dev-settings-back" type="button">BACK</button>
      <div class="dev-settings">
        <h1>DEV SETTINGS</h1>
        <label class="dev-setting">INVULNERABLE <input data-dev-setting="invulnerable" type="checkbox"></label>
        <label class="dev-setting">SHOW FPS <input data-dev-setting="showFps" type="checkbox"></label>
        <label class="dev-setting">SHOW MOVEMENT FRAME <input data-dev-setting="showMovementFrame" type="checkbox"></label>
        <label class="dev-setting">SHOW SPLINE <input data-dev-setting="showSpline" type="checkbox"></label>
        <button class="dev-level-toggle" id="dev-level-toggle" type="button" aria-expanded="false">SWITCH LEVEL</button>
        <div class="dev-level-list" id="dev-level-list" hidden>
          ${LEVEL_IDS.map((id) => `<button type="button" data-dev-level="${id}">${id} · ${LEVELS[id].name.toUpperCase()}</button>`).join('')}
        </div>
      </div>
    </div>` : ''}
  <div class="damage-vignette" id="damage-vignette" aria-hidden="true"></div>
  <div class="level-transition" id="level-transition" aria-live="polite"><span id="level-transition-label">LEVEL 1</span></div>
  <div class="loading-screen" id="loading-screen" hidden aria-live="polite" aria-busy="true">
    <div class="loading-screen__content">
      <p class="loading-screen__eyebrow" id="loading-eyebrow">PREPARING SORTIE</p>
      <h1 id="loading-title">LEVEL 1</h1>
      <div class="loading-screen__track"><div class="loading-screen__fill" id="loading-fill"></div></div>
      <p class="loading-screen__status" id="loading-status">Loading…</p>
      <button id="loading-retry" type="button" hidden>RETRY</button>
    </div>
  </div>
  <div class="menu" id="game-over-menu" hidden>
    <h1 class="menu__title">GAME OVER</h1>
    <div class="menu__actions">
      <button id="retry-button" type="button">RETRY</button>
      <button id="game-over-main-menu-button" type="button">MAIN MENU</button>
    </div>
  </div>
  <div class="hud" id="hud" hidden>
    <div class="hud__shield">
      <div class="hud__eyebrow"><span>SHIELD</span><span id="shield">100%</span></div>
      <div class="hud__shield-track" role="meter" aria-label="Shield" aria-valuemin="0" aria-valuemax="5" aria-valuenow="5"><div class="hud__shield-fill" id="shield-fill"></div></div>
    </div>
    <div class="hud__score"><span class="hud__score-label">SCORE</span><span class="hud__score-value" id="score">0000</span></div>
    <div class="hud__boss" id="boss-health" hidden>
      <div class="hud__eyebrow"><span>GUARDIAN</span><span id="boss-health-value">100%</span></div>
      <div class="hud__boss-track"><div class="hud__boss-fill" id="boss-health-fill"></div></div>
    </div>
    <div class="hud__fps" id="fps" hidden>FPS 0</div>
  </div>`;
*/
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
const audio = createAudioSystem();
const audioFeedback = new FlightAudioFeedback(audio);
const flightEvents = new FlightEventBus();
flightEvents.subscribe((event) => audioFeedback.handle(event));
let simulation = new FlightSimulation({
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
const gameOverMenu = requiredElement<HTMLDivElement>("#game-over-menu");
const retryButton = requiredElement<HTMLButtonElement>("#retry-button");
const gameOverMainMenuButton = requiredElement<HTMLButtonElement>(
  "#game-over-main-menu-button",
);
const bossHealth = requiredElement<HTMLDivElement>("#boss-health");
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
let previous = performance.now();
let accumulator = 0;
const lifecycle = new GameLifecycle();
let closeDevOverlay: (() => void) | null = null;
type DevSettingName =
  "invulnerable" | "showFps" | "showMovementFrame" | "showSpline";
type DevSettings = Record<DevSettingName, boolean>;
const devSettings: DevSettings = {
  invulnerable: false,
  showFps: false,
  showMovementFrame: false,
  showSpline: false,
};
let fpsFrames = 0;
let fpsElapsed = 0;
let loading = false;
let retryLoad: (() => void) | null = null;
let settingsSource = {
  menu: pauseMenu,
  button: settingsButton,
};

function applyDevSettings() {
  fps.hidden = !devSettings.showFps;
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

async function startGame(
  levelNumber = 1,
  carry?: { shield: number; score: number },
) {
  if (loading) return;
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
    loadingStatus.textContent = "Building world…";
    await nextPaint();
    currentLevelNumber = levelNumber;
    const level = LEVELS[levelId];
    const world = createWorld(level.systems);
    view.dispose();
    simulation = new FlightSimulation({
      ...carry,
      level: currentLevelNumber,
      world,
      events: flightEvents,
    });
    view = new GameView(appRoot, level, world, assets);
    view.setRenderScale(Number(renderScaleSelect.value));
    view.setAntiAliasing(antiAliasingInput.checked);
    view.setReticleVisible(targetingReticleInput.checked);
    applyDevSettings();
    lifecycle.startPlaying();
    mainMenu.hidden = true;
    pauseMenu.hidden = true;
    controlsMenu.hidden = true;
    settingsMenu.hidden = true;
    gameOverMenu.hidden = true;
    document
      .querySelectorAll<HTMLElement>(
        "#dev-menu, #dev-settings-menu, #asset-scaling-menu",
      )
      .forEach((menu) => (menu.hidden = true));
    closeDevOverlay = null;
    hud.hidden = false;
    damageVignette.classList.remove("damage-vignette--active");
    levelTransition.className = "level-transition";
    accumulator = 0;
    previous = performance.now();
    updateRenderResolution();
    hideLoading();
  } catch (error) {
    showLoadingError(
      error instanceof Error ? error.message : "Failed to load level assets.",
    );
    retryLoad = () => {
      void startGame(levelNumber, carry);
    };
  } finally {
    loading = false;
  }
}

function pauseGame() {
  if (!lifecycle.pause()) return;
  pauseMenu.hidden = false;
}

function continueGame() {
  if (!lifecycle.resume()) return;
  pauseMenu.hidden = true;
  accumulator = 0;
}

function returnToMainMenu() {
  lifecycle.returnToMenu();
  pauseMenu.hidden = true;
  mainMenu.hidden = false;
  hud.hidden = true;
  gameOverMenu.hidden = true;
  startButton.focus();
}

function openControls() {
  pauseMenu.hidden = true;
  controlsMenu.hidden = false;
  controlsBackButton.focus();
}

function closeControls() {
  controlsMenu.hidden = true;
  pauseMenu.hidden = false;
  controlsButton.focus();
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
  sourceMenu.hidden = true;
  settingsMenu.hidden = false;
  settingsBackButton.focus();
}

function closeSettings() {
  settingsMenu.hidden = true;
  settingsSource.menu.hidden = false;
  settingsSource.button.focus();
}

startButton.addEventListener("click", () => {
  void startGame(1);
});
retryButton.addEventListener("click", () => {
  void startGame(1);
});
loadingRetry.addEventListener("click", () => retryLoad?.());
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
  if (event.code !== "Escape" || event.repeat) return;
  if (!controlsMenu.hidden) {
    closeControls();
    return;
  }
  if (!settingsMenu.hidden) {
    closeSettings();
    return;
  }
  const devMenuOpen = document.querySelector<HTMLElement>(
    "#dev-menu:not([hidden]), #dev-settings-menu:not([hidden]), #asset-scaling-menu:not([hidden])",
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

// Test/development shortcut: ?play=3&dev=invulnerable
const requestedLevel = levelFromQuery(
  new URLSearchParams(location.search).get("play"),
);
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
      simulation.invulnerable = devSettings.invulnerable;
      const result = simulation.step(input.command(), fixedDt);
      if (result.playerHits > 0) flashDamageVignette();
      if (simulation.player.shield <= 0) showGameOver();
      else if (result.bossDefeated) beginNextLevel();
      accumulator -= fixedDt;
    }
  });
  if (score) score.textContent = simulation.score.toString().padStart(4, "0");
  const shieldPercent = (simulation.player.shield / 5) * 100;
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
  const boss = simulation.boss;
  const bossEngaged = boss && boss.railDistance - simulation.railDistance < 140;
  bossHealth.hidden = !bossEngaged;
  if (boss) {
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
    performanceRecorder.span("view.render", () => view.sync(simulation));
}

requestAnimationFrame(frame);

function flashDamageVignette() {
  damageVignette.classList.remove("damage-vignette--active");
  void damageVignette.offsetWidth;
  damageVignette.classList.add("damage-vignette--active");
}

function showGameOver() {
  if (!lifecycle.gameOver()) return;
  hud.hidden = true;
  gameOverMenu.hidden = false;
  retryButton.focus();
}

function beginNextLevel() {
  if (!lifecycle.beginTransition()) return;
  const nextLevel = currentLevelNumber + 1;
  const carry = { shield: simulation.player.shield, score: simulation.score };
  levelTransitionLabel.textContent = `LEVEL ${nextLevel}`;
  levelTransition.className = "level-transition level-transition--active";
  window.setTimeout(() => {
    void startGame(nextLevel, carry);
  }, 900);
}

function showLoading(levelNumber: number, isNewRun: boolean) {
  retryLoad = null;
  loadingScreen.hidden = false;
  loadingScreen.classList.remove("loading-screen--error");
  loadingEyebrow.textContent = isNewRun
    ? "PREPARING SORTIE"
    : "ENTERING NEW AIRSPACE";
  loadingTitle.textContent = `LEVEL ${levelNumber}`;
  loadingStatus.textContent = "Preparing asset manifest…";
  loadingFill.style.width = "0%";
  loadingRetry.hidden = true;
  startButton.disabled = true;
  hud.hidden = true;
}

function updateLoadingProgress(progress: AssetLoadProgress) {
  loadingStatus.textContent = progress.label;
  loadingFill.style.width = `${progress.total ? (progress.loaded / progress.total) * 100 : 0}%`;
}

function hideLoading() {
  loadingScreen.hidden = true;
  levelTransition.className = "level-transition";
  startButton.disabled = false;
  retryLoad = null;
}

function showLoadingError(message: string) {
  loadingScreen.classList.add("loading-screen--error");
  loadingEyebrow.textContent = "LOAD FAILED";
  loadingStatus.textContent = message;
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
  const openAssetScalingButton = requiredElement<HTMLButtonElement>(
    "#open-asset-scaling",
  );
  const settingsMenu = requiredElement<HTMLDivElement>("#dev-settings-menu");
  const backButton = requiredElement<HTMLButtonElement>("#dev-settings-back");
  const assetScalingMenu = requiredElement<HTMLDivElement>(
    "#asset-scaling-menu",
  );
  const assetScalingBack = requiredElement<HTMLButtonElement>(
    "#asset-scaling-back",
  );
  const levelToggle = requiredElement<HTMLButtonElement>("#dev-level-toggle");
  const levelList = requiredElement<HTMLDivElement>("#dev-level-list");
  let assetScaleTool: { refresh: () => void } | undefined;
  let closeRootMenu: (() => void) | undefined;

  function openMenu(
    sourceMenu: HTMLDivElement,
    sourceButton: HTMLButtonElement,
  ) {
    sourceMenu.hidden = true;
    devMenu.hidden = false;
    devMenuBack.focus();
    closeRootMenu = () => {
      devMenu.hidden = true;
      sourceMenu.hidden = false;
      sourceButton.focus();
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
    devMenu.hidden = true;
    submenu.hidden = false;
    back.focus();
    closeDevOverlay = () => {
      submenu.hidden = true;
      devMenu.hidden = false;
      sourceButton.focus();
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
  openSettingsButton.addEventListener("click", () =>
    openSubmenu(settingsMenu, openSettingsButton, backButton),
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
  assetScalingBack.addEventListener("click", () => closeDevOverlay?.());
  levelToggle.addEventListener("click", () => {
    levelList.hidden = !levelList.hidden;
    levelToggle.setAttribute("aria-expanded", (!levelList.hidden).toString());
  });
  levelList
    .querySelectorAll<HTMLButtonElement>("[data-dev-level]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const levelId = Number(button.dataset.devLevel) as LevelId;
        levelList.hidden = true;
        levelToggle.setAttribute("aria-expanded", "false");
        void startGame(levelId);
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
      void startGame(levelId);
    },
  };
  applyDevSettings();
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
