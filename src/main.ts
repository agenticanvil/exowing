import './style.css';
import { InputState } from './input/inputState';
import { FlightSimulation } from './sim/flightSimulation';
import { GameView } from './view/gameView';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing app root');

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
      <button id="controls-button" type="button">CONTROLS</button>
      <button id="main-menu-button" type="button">MAIN MENU</button>
      ${import.meta.env.DEV ? '<button id="dev-settings-button" type="button">DEV SETTINGS</button>' : ''}
    </div>
  </div>
  <div class="menu" id="controls-menu" hidden>
    <button class="menu__back" id="controls-back" type="button">BACK</button>
    <div class="controls">
      <h1>CONTROLS</h1>
      <dl>
        <div><dt>MOVE</dt><dd>W A S D</dd></div>
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
      </div>
    </div>` : ''}
  <div class="damage-vignette" id="damage-vignette" aria-hidden="true"></div>
  <div class="hud" id="hud" hidden><div>EXOWING</div><div class="hud__health"><div class="hud__health-label">HULL INTEGRITY <span id="health">100%</span></div><div class="hud__health-track" role="meter" aria-label="Hull integrity" aria-valuemin="0" aria-valuemax="5" aria-valuenow="5"><div class="hud__health-fill" id="health-fill"></div></div></div><div class="hud__score">SCORE <span id="score">0000</span></div><div class="hud__fps" id="fps" hidden>FPS 0</div></div>`;

let simulation = new FlightSimulation();
const input = new InputState();
const view = new GameView(app);
const score = document.querySelector<HTMLSpanElement>('#score');
const health = requiredElement<HTMLSpanElement>('#health');
const healthFill = requiredElement<HTMLDivElement>('#health-fill');
const healthTrack = requiredElement<HTMLDivElement>('.hud__health-track');
const damageVignette = requiredElement<HTMLDivElement>('#damage-vignette');
const fps = requiredElement<HTMLDivElement>('#fps');
const hud = requiredElement<HTMLDivElement>('#hud');
const mainMenu = requiredElement<HTMLDivElement>('#main-menu');
const pauseMenu = requiredElement<HTMLDivElement>('#pause-menu');
const controlsMenu = requiredElement<HTMLDivElement>('#controls-menu');
const startButton = requiredElement<HTMLButtonElement>('#start-button');
const continueButton = requiredElement<HTMLButtonElement>('#continue-button');
const controlsButton = requiredElement<HTMLButtonElement>('#controls-button');
const controlsBackButton = requiredElement<HTMLButtonElement>('#controls-back');
const mainMenuButton = requiredElement<HTMLButtonElement>('#main-menu-button');
const fixedDt = 1 / 60;
let previous = performance.now();
let accumulator = 0;
type GameMode = 'menu' | 'playing' | 'paused';
let mode: GameMode = 'menu';
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

function applyDevSettings() {
  fps.hidden = !devSettings.showFps;
  view.setDebugVisibility(devSettings.showMovementFrame, devSettings.showSpline);
  document.querySelectorAll<HTMLInputElement>('[data-dev-setting]').forEach((input) => {
    input.checked = devSettings[input.dataset.devSetting as DevSettingName];
  });
}

function startGame() {
  simulation = new FlightSimulation();
  mode = 'playing';
  mainMenu.hidden = true;
  pauseMenu.hidden = true;
  hud.hidden = false;
  accumulator = 0;
}

function pauseGame() {
  if (mode !== 'playing') return;
  mode = 'paused';
  pauseMenu.hidden = false;
}

function continueGame() {
  if (mode !== 'paused') return;
  mode = 'playing';
  pauseMenu.hidden = true;
  accumulator = 0;
}

function returnToMainMenu() {
  mode = 'menu';
  pauseMenu.hidden = true;
  mainMenu.hidden = false;
  hud.hidden = true;
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

startButton.addEventListener('click', startGame);
continueButton.addEventListener('click', continueGame);
controlsButton.addEventListener('click', openControls);
controlsBackButton.addEventListener('click', closeControls);
mainMenuButton.addEventListener('click', returnToMainMenu);
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Escape' || event.repeat) return;
  if (!controlsMenu.hidden) {
    closeControls();
    return;
  }
  const settingsMenu = document.querySelector<HTMLDivElement>('#dev-settings-menu');
  if (settingsMenu && !settingsMenu.hidden && closeDevSettings) {
    closeDevSettings();
    return;
  }
  if (mode === 'playing') pauseGame();
  else if (mode === 'paused') continueGame();
});

// Test/development shortcut: http://localhost:5173/?play=1
if (new URLSearchParams(location.search).get('play') === '1') startGame();
else startButton.focus();

if (import.meta.env.DEV) setupDevControls();

function frame(now: number) {
  const frameDt = Math.min((now - previous) / 1000, 0.1);
  accumulator += frameDt;
  previous = now;
  while (mode === 'playing' && accumulator >= fixedDt) {
    simulation.invulnerable = devSettings.invulnerable;
    const result = simulation.step(input.command(), fixedDt);
    if (result.playerHits > 0) flashDamageVignette();
    accumulator -= fixedDt;
  }
  if (score) score.textContent = simulation.score.toString().padStart(4, '0');
  const healthPercent = simulation.player.health / 5 * 100;
  health.textContent = `${healthPercent}%`;
  healthFill.style.width = `${healthPercent}%`;
  healthFill.classList.toggle('hud__health-fill--critical', simulation.player.health <= 2);
  healthTrack.setAttribute('aria-valuenow', simulation.player.health.toString());
  if (devSettings.showFps) {
    fpsFrames++;
    fpsElapsed += frameDt;
    if (fpsElapsed >= 0.5) {
      fps.textContent = `FPS ${Math.round(fpsFrames / fpsElapsed)}`;
      fpsFrames = 0;
      fpsElapsed = 0;
    }
  }
  view.sync(simulation);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

function flashDamageVignette() {
  damageVignette.classList.remove('damage-vignette--active');
  void damageVignette.offsetWidth;
  damageVignette.classList.add('damage-vignette--active');
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

function setupDevControls() {
  const pauseSettingsButton = requiredElement<HTMLButtonElement>('#dev-settings-button');
  const startSettingsButton = requiredElement<HTMLButtonElement>('#start-dev-settings-button');
  const settingsMenu = requiredElement<HTMLDivElement>('#dev-settings-menu');
  const backButton = requiredElement<HTMLButtonElement>('#dev-settings-back');

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
    start(overrides = {}) {
      Object.assign(devSettings, overrides);
      applyDevSettings();
      startGame();
    },
  };
  applyDevSettings();
}

declare global {
  interface Window {
    exowingDev?: {
      settings: DevSettings;
      set: (name: DevSettingName, enabled?: boolean) => void;
      start: (overrides?: Partial<DevSettings>) => void;
    };
  }
}
