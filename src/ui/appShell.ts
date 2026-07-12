import { LEVEL_IDS, LEVELS } from "../levels";

export function mountAppShell(app: HTMLElement, dev = import.meta.env.DEV) {
  const devButton = (id: string) =>
    dev ? `<button id="${id}" type="button">DEV SETTINGS</button>` : "";
  app.innerHTML = `
    <div class="menu" id="main-menu"><h1 class="menu__title">EXOWING</h1><div class="menu__actions"><button id="start-button" type="button">START</button>${devButton("start-dev-settings-button")}</div></div>
    <div class="menu" id="pause-menu" hidden><h1 class="menu__title">PAUSED</h1><div class="menu__actions"><button id="continue-button" type="button">CONTINUE</button><button id="settings-button" type="button">SETTINGS</button><button id="controls-button" type="button">CONTROLS</button><button id="main-menu-button" type="button">MAIN MENU</button>${devButton("dev-settings-button")}</div></div>
    <div class="menu" id="settings-menu" hidden><button class="menu__back" id="settings-back" type="button">BACK</button><div class="settings"><h1>SETTINGS</h1><div class="setting-row"><div><span>GRAPHICS</span><small id="render-resolution"></small></div><select id="render-scale" aria-label="Graphics quality"><option value="0.5">LOW</option><option value="0.75">MEDIUM</option><option value="1">HIGH</option></select></div><label class="setting-row setting-toggle"><span>ANTI-ALIASING</span><input id="anti-aliasing" type="checkbox"></label></div></div>
    <div class="menu" id="controls-menu" hidden><button class="menu__back" id="controls-back" type="button">BACK</button><div class="controls"><h1>CONTROLS</h1><dl><div><dt>MOVE</dt><dd>W A S D</dd></div><div><dt>BARREL ROLL / DODGE</dt><dd>Q / E</dd></div><div><dt>FIRE</dt><dd>SPACE</dd></div><div><dt>FASTER</dt><dd>SHIFT</dd></div><div><dt>BRAKE</dt><dd>ALT</dd></div><div><dt>PAUSE</dt><dd>ESC</dd></div></dl></div></div>
    ${dev ? `<div class="menu" id="dev-settings-menu" hidden><button class="menu__back" id="dev-settings-back" type="button">BACK</button><div class="dev-settings"><h1>DEV SETTINGS</h1><label class="dev-setting">INVULNERABLE <input data-dev-setting="invulnerable" type="checkbox"></label><label class="dev-setting">SHOW FPS <input data-dev-setting="showFps" type="checkbox"></label><label class="dev-setting">SHOW MOVEMENT FRAME <input data-dev-setting="showMovementFrame" type="checkbox"></label><label class="dev-setting">SHOW SPLINE <input data-dev-setting="showSpline" type="checkbox"></label><button class="dev-level-toggle" id="dev-level-toggle" type="button" aria-expanded="false">SWITCH LEVEL</button><div class="dev-level-list" id="dev-level-list" hidden>${LEVEL_IDS.map((id) => `<button type="button" data-dev-level="${id}">${id} · ${LEVELS[id].name.toUpperCase()}</button>`).join("")}</div></div></div>` : ""}
    <div class="damage-vignette" id="damage-vignette" aria-hidden="true"></div><div class="level-transition" id="level-transition" aria-live="polite"><span id="level-transition-label">LEVEL 1</span></div>
    <div class="loading-screen" id="loading-screen" hidden aria-live="polite" aria-busy="true"><div class="loading-screen__content"><p class="loading-screen__eyebrow" id="loading-eyebrow">PREPARING SORTIE</p><h1 id="loading-title">LEVEL 1</h1><div class="loading-screen__track"><div class="loading-screen__fill" id="loading-fill"></div></div><p class="loading-screen__status" id="loading-status">Loading…</p><button id="loading-retry" type="button" hidden>RETRY</button></div></div>
    <div class="menu" id="game-over-menu" hidden><h1 class="menu__title">GAME OVER</h1><div class="menu__actions"><button id="retry-button" type="button">RETRY</button><button id="game-over-main-menu-button" type="button">MAIN MENU</button></div></div>
    <div class="hud" id="hud" hidden><div class="hud__health"><div class="hud__eyebrow"><span>HULL INTEGRITY</span><span id="health">100%</span></div><div class="hud__health-track" role="meter" aria-label="Hull integrity" aria-valuemin="0" aria-valuemax="5" aria-valuenow="5"><div class="hud__health-fill" id="health-fill"></div></div></div><div class="hud__score"><span class="hud__score-label">SCORE</span><span class="hud__score-value" id="score">0000</span></div><div class="hud__boss" id="boss-health" hidden><div class="hud__eyebrow"><span>GUARDIAN</span><span id="boss-health-value">100%</span></div><div class="hud__boss-track"><div class="hud__boss-fill" id="boss-health-fill"></div></div></div><div class="hud__fps" id="fps" hidden>FPS 0</div></div>`;
}

export function requiredElement<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}
