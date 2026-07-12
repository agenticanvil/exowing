import './style.css';
import { InputState } from './input/inputState';
import { LEVEL_IDS, LEVELS, type LevelId } from './levels';
import { createWorld } from './world/worldSystem';
import { FlightSimulation } from './sim/flightSimulation';
import { GameView } from './view/gameView';
import { loadGameAssets, type AssetLoadProgress } from './assets/gameAssets';
import { mountAppShell, requiredElement } from './ui/appShell';
import { GameLifecycle } from './game/gameLifecycle';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing app root');
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
    <div class="hud__health">
      <div class="hud__eyebrow"><span>HULL INTEGRITY</span><span id="health">100%</span></div>
      <div class="hud__health-track" role="meter" aria-label="Hull integrity" aria-valuemin="0" aria-valuemax="5" aria-valuenow="5"><div class="hud__health-fill" id="health-fill"></div></div>
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

const initialWorld = createWorld(LEVELS[1].systems);
let simulation = new FlightSimulation({ world: initialWorld });
const input = new InputState();
let currentLevelNumber = 1;
let view = new GameView(appRoot, LEVELS[1], initialWorld);
const score = document.querySelector<HTMLSpanElement>('#score');
const health = requiredElement<HTMLSpanElement>('#health');
const healthFill = requiredElement<HTMLDivElement>('#health-fill');
const healthTrack = requiredElement<HTMLDivElement>('.hud__health-track');
const damageVignette = requiredElement<HTMLDivElement>('#damage-vignette');
const levelTransition = requiredElement<HTMLDivElement>('#level-transition');
const levelTransitionLabel = requiredElement<HTMLSpanElement>('#level-transition-label');
const loadingScreen = requiredElement<HTMLDivElement>('#loading-screen');
const loadingEyebrow = requiredElement<HTMLParagraphElement>('#loading-eyebrow');
const loadingTitle = requiredElement<HTMLHeadingElement>('#loading-title');
const loadingFill = requiredElement<HTMLDivElement>('#loading-fill');
const loadingStatus = requiredElement<HTMLParagraphElement>('#loading-status');
const loadingRetry = requiredElement<HTMLButtonElement>('#loading-retry');
const gameOverMenu = requiredElement<HTMLDivElement>('#game-over-menu');
const retryButton = requiredElement<HTMLButtonElement>('#retry-button');
const gameOverMainMenuButton = requiredElement<HTMLButtonElement>('#game-over-main-menu-button');
const bossHealth = requiredElement<HTMLDivElement>('#boss-health');
const bossHealthValue = requiredElement<HTMLSpanElement>('#boss-health-value');
const bossHealthFill = requiredElement<HTMLDivElement>('#boss-health-fill');
const fps = requiredElement<HTMLDivElement>('#fps');
const hud = requiredElement<HTMLDivElement>('#hud');
const mainMenu = requiredElement<HTMLDivElement>('#main-menu');
const pauseMenu = requiredElement<HTMLDivElement>('#pause-menu');
const controlsMenu = requiredElement<HTMLDivElement>('#controls-menu');
const settingsMenu = requiredElement<HTMLDivElement>('#settings-menu');
const startButton = requiredElement<HTMLButtonElement>('#start-button');
const continueButton = requiredElement<HTMLButtonElement>('#continue-button');
const controlsButton = requiredElement<HTMLButtonElement>('#controls-button');
const settingsButton = requiredElement<HTMLButtonElement>('#settings-button');
const settingsBackButton = requiredElement<HTMLButtonElement>('#settings-back');
const renderScaleSelect = requiredElement<HTMLSelectElement>('#render-scale');
const renderResolution = requiredElement<HTMLElement>('#render-resolution');
const antiAliasingInput = requiredElement<HTMLInputElement>('#anti-aliasing');
const controlsBackButton = requiredElement<HTMLButtonElement>('#controls-back');
const mainMenuButton = requiredElement<HTMLButtonElement>('#main-menu-button');
const fixedDt = 1 / 60;
let previous = performance.now();
let accumulator = 0;
const lifecycle = new GameLifecycle();
let closeDevSettings: (() => void) | null = null;
type DevSettingName = 'invulnerable' | 'showFps' | 'showMovementFrame' | 'showSpline';
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

function applyDevSettings() {
  fps.hidden = !devSettings.showFps;
  view.setDebugVisibility(devSettings.showMovementFrame, devSettings.showSpline);
  document.querySelectorAll<HTMLInputElement>('[data-dev-setting]').forEach((input) => {
    input.checked = devSettings[input.dataset.devSetting as DevSettingName];
  });
}

function styleForLevel(levelNumber: number): LevelId {
  return LEVEL_IDS[(levelNumber - 1) % LEVEL_IDS.length];
}

async function startGame(levelNumber = 1, carry?: { health: number; score: number }) {
  if (loading) return;
  loading = true;
  const isNewRun = !carry;
  showLoading(levelNumber, isNewRun);
  try {
    const levelId = styleForLevel(levelNumber);
    const assets = await withTimeout(
      loadGameAssets(levelId, updateLoadingProgress),
      60_000,
      'Timed out while loading level assets.',
    );
    loadingStatus.textContent = 'Building world…';
    await nextPaint();
    currentLevelNumber = levelNumber;
    const level = LEVELS[levelId];
    const world = createWorld(level.systems);
    view.dispose();
    simulation = new FlightSimulation({ ...carry, level: currentLevelNumber, world });
    view = new GameView(appRoot, level, world, assets);
    view.setRenderScale(Number(renderScaleSelect.value));
    view.setAntiAliasing(antiAliasingInput.checked);
    applyDevSettings();
    lifecycle.startPlaying();
    mainMenu.hidden = true;
    pauseMenu.hidden = true;
    controlsMenu.hidden = true;
    settingsMenu.hidden = true;
    gameOverMenu.hidden = true;
    const devSettingsMenu = document.querySelector<HTMLDivElement>('#dev-settings-menu');
    if (devSettingsMenu) devSettingsMenu.hidden = true;
    closeDevSettings = null;
    hud.hidden = false;
    damageVignette.classList.remove('damage-vignette--active');
    levelTransition.className = 'level-transition';
    accumulator = 0;
    previous = performance.now();
    updateRenderResolution();
    hideLoading();
  } catch (error) {
    showLoadingError(error instanceof Error ? error.message : 'Failed to load level assets.');
    retryLoad = () => { void startGame(levelNumber, carry); };
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

function openSettings() {
  pauseMenu.hidden = true;
  settingsMenu.hidden = false;
  settingsBackButton.focus();
}

function closeSettings() {
  settingsMenu.hidden = true;
  pauseMenu.hidden = false;
  settingsButton.focus();
}

startButton.addEventListener('click', () => { void startGame(1); });
retryButton.addEventListener('click', () => { void startGame(1); });
loadingRetry.addEventListener('click', () => retryLoad?.());
gameOverMainMenuButton.addEventListener('click', returnToMainMenu);
continueButton.addEventListener('click', continueGame);
controlsButton.addEventListener('click', openControls);
settingsButton.addEventListener('click', openSettings);
settingsBackButton.addEventListener('click', closeSettings);
controlsBackButton.addEventListener('click', closeControls);
mainMenuButton.addEventListener('click', returnToMainMenu);
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Escape' || event.repeat) return;
  if (!controlsMenu.hidden) {
    closeControls();
    return;
  }
  if (!settingsMenu.hidden) {
    closeSettings();
    return;
  }
  const devSettingsMenu = document.querySelector<HTMLDivElement>('#dev-settings-menu');
  if (devSettingsMenu && !devSettingsMenu.hidden && closeDevSettings) {
    closeDevSettings();
    return;
  }
  if (lifecycle.mode === 'playing') pauseGame();
  else if (lifecycle.mode === 'paused') continueGame();
});

const storedRenderScale = Number(localStorage.getItem('exowing.renderScale'));
const initialRenderScale = [0.5, 0.75, 1].includes(storedRenderScale) ? storedRenderScale : 1;
const antiAliasingEnabled = localStorage.getItem('exowing.antiAliasing') !== 'false';
renderScaleSelect.value = initialRenderScale.toString();
antiAliasingInput.checked = antiAliasingEnabled;
view.setRenderScale(initialRenderScale);
view.setAntiAliasing(antiAliasingEnabled);
updateRenderResolution();
renderScaleSelect.addEventListener('change', () => {
  const scale = Number(renderScaleSelect.value);
  view.setRenderScale(scale);
  updateRenderResolution();
  try { localStorage.setItem('exowing.renderScale', scale.toString()); } catch { /* Persistence is optional. */ }
});
antiAliasingInput.addEventListener('change', () => {
  view.setAntiAliasing(antiAliasingInput.checked);
  try { localStorage.setItem('exowing.antiAliasing', antiAliasingInput.checked.toString()); } catch { /* Persistence is optional. */ }
});
window.addEventListener('resize', updateRenderResolution);

if (import.meta.env.DEV) setupDevControls();

// Test/development shortcut: ?play=3&dev=invulnerable
const requestedLevel = levelFromQuery(new URLSearchParams(location.search).get('play'));
if (requestedLevel) void startGame(requestedLevel);
else startButton.focus();

function frame(now: number) {
  const frameDt = Math.min((now - previous) / 1000, 0.1);
  accumulator += frameDt;
  previous = now;
  while (lifecycle.mode === 'playing' && accumulator >= fixedDt) {
    simulation.invulnerable = devSettings.invulnerable;
    const result = simulation.step(input.command(), fixedDt);
    if (result.playerHits > 0) flashDamageVignette();
    if (simulation.player.health <= 0) showGameOver();
    else if (result.bossDefeated) beginNextLevel();
    accumulator -= fixedDt;
  }
  if (score) score.textContent = simulation.score.toString().padStart(4, '0');
  const healthPercent = simulation.player.health / 5 * 100;
  health.textContent = `${Math.round(healthPercent)}%`;
  healthFill.style.width = `${healthPercent}%`;
  healthFill.classList.toggle('hud__health-fill--critical', simulation.player.health <= 2);
  healthTrack.setAttribute('aria-valuenow', simulation.player.health.toString());
  const boss = simulation.boss;
  const bossEngaged = boss && boss.railDistance - simulation.railDistance < 140;
  bossHealth.hidden = !bossEngaged;
  if (boss) {
    const bossPercent = Math.max(0, (boss.health ?? 0) / (boss.maxHealth ?? 1) * 100);
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
  if (lifecycle.shouldRender()) view.sync(simulation);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

function flashDamageVignette() {
  damageVignette.classList.remove('damage-vignette--active');
  void damageVignette.offsetWidth;
  damageVignette.classList.add('damage-vignette--active');
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
  const carry = { health: simulation.player.health, score: simulation.score };
  levelTransitionLabel.textContent = `LEVEL ${nextLevel}`;
  levelTransition.className = 'level-transition level-transition--active';
  window.setTimeout(() => {
    void startGame(nextLevel, carry);
  }, 900);
}

function showLoading(levelNumber: number, isNewRun: boolean) {
  retryLoad = null;
  loadingScreen.hidden = false;
  loadingScreen.classList.remove('loading-screen--error');
  loadingEyebrow.textContent = isNewRun ? 'PREPARING SORTIE' : 'ENTERING NEW AIRSPACE';
  loadingTitle.textContent = `LEVEL ${levelNumber}`;
  loadingStatus.textContent = 'Preparing asset manifest…';
  loadingFill.style.width = '0%';
  loadingRetry.hidden = true;
  startButton.disabled = true;
  hud.hidden = true;
}

function updateLoadingProgress(progress: AssetLoadProgress) {
  loadingStatus.textContent = progress.label;
  loadingFill.style.width = `${progress.total ? progress.loaded / progress.total * 100 : 0}%`;
}

function hideLoading() {
  loadingScreen.hidden = true;
  levelTransition.className = 'level-transition';
  startButton.disabled = false;
  retryLoad = null;
}

function showLoadingError(message: string) {
  loadingScreen.classList.add('loading-screen--error');
  loadingEyebrow.textContent = 'LOAD FAILED';
  loadingStatus.textContent = message;
  loadingRetry.hidden = false;
  startButton.disabled = false;
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
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
  const pauseSettingsButton = requiredElement<HTMLButtonElement>('#dev-settings-button');
  const startSettingsButton = requiredElement<HTMLButtonElement>('#start-dev-settings-button');
  const settingsMenu = requiredElement<HTMLDivElement>('#dev-settings-menu');
  const backButton = requiredElement<HTMLButtonElement>('#dev-settings-back');
  const levelToggle = requiredElement<HTMLButtonElement>('#dev-level-toggle');
  const levelList = requiredElement<HTMLDivElement>('#dev-level-list');

  function openSettings(sourceMenu: HTMLDivElement, sourceButton: HTMLButtonElement) {
    sourceMenu.hidden = true;
    settingsMenu.hidden = false;
    backButton.focus();
    closeDevSettings = () => {
      settingsMenu.hidden = true;
      sourceMenu.hidden = false;
      sourceButton.focus();
      closeDevSettings = null;
    };
  }

  pauseSettingsButton.addEventListener('click', () => openSettings(pauseMenu, pauseSettingsButton));
  startSettingsButton.addEventListener('click', () => openSettings(mainMenu, startSettingsButton));
  backButton.addEventListener('click', () => closeDevSettings?.());
  levelToggle.addEventListener('click', () => {
    levelList.hidden = !levelList.hidden;
    levelToggle.setAttribute('aria-expanded', (!levelList.hidden).toString());
  });
  levelList.querySelectorAll<HTMLButtonElement>('[data-dev-level]').forEach((button) => {
    button.addEventListener('click', () => {
      const levelId = Number(button.dataset.devLevel) as LevelId;
      levelList.hidden = true;
      levelToggle.setAttribute('aria-expanded', 'false');
      void startGame(levelId);
    });
  });
  document.querySelectorAll<HTMLInputElement>('[data-dev-setting]').forEach((input) => {
    input.addEventListener('change', () => {
      devSettings[input.dataset.devSetting as DevSettingName] = input.checked;
      applyDevSettings();
    });
  });

  const aliases: Record<string, DevSettingName> = {
    invulnerable: 'invulnerable', fps: 'showFps', frame: 'showMovementFrame', spline: 'showSpline',
  };
  const requested = new URLSearchParams(location.search).get('dev')?.split(',') ?? [];
  for (const alias of requested) if (aliases[alias]) devSettings[aliases[alias]] = true;

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
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return LEVEL_IDS.find((id) => LEVELS[id].name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === normalized) ?? null;
}
