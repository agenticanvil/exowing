import { LEVEL_IDS, LEVELS } from "../levels";
import { PICKUPS, PICKUP_IDS } from "../pickups";
import { UPGRADES, UPGRADE_BRANCHES, type UpgradeId } from "../upgrades";

function menuRail(label: string, backId?: string, backLabel?: string) {
  return `<div class="menu__rail">${
    backId
      ? `<button class="menu__back" id="${backId}" type="button" aria-label="${backLabel ?? "Back"}"><span aria-hidden="true">‹</span></button>`
      : `<span class="menu__rail-mark" aria-hidden="true"></span>`
  }<span class="menu__rail-label">${label}</span></div>`;
}

function menuAction(
  id: string,
  label: string,
  detail?: string,
  className = "",
) {
  return `<button ${className ? `class="${className}" ` : ""}id="${id}" type="button" aria-label="${label}"><span>${label}</span>${detail ? `<small>${detail}</small>` : ""}</button>`;
}

function upgradeNode(upgradeId: UpgradeId) {
  const upgrade = UPGRADES[upgradeId];
  return `<button class="upgrade-node" type="button" data-upgrade-id="${upgradeId}" data-upgrade-status="locked" aria-pressed="false"><span class="upgrade-node__tier">TIER ${upgrade.tier}</span><strong>${upgrade.label.toUpperCase()}</strong><span class="upgrade-node__state" data-upgrade-node-state>LOCKED</span></button>`;
}

function upgradeBranch(branch: (typeof UPGRADE_BRANCHES)[number]) {
  return `<section class="upgrade-branch" data-upgrade-branch="${branch.id}" aria-labelledby="upgrade-branch-${branch.id}"><header><p id="upgrade-branch-${branch.id}">${branch.label.toUpperCase()}</p><span>${branch.specialty.toUpperCase()}</span></header><div class="upgrade-branch__root">${upgradeNode(branch.root)}</div><div class="upgrade-branch__fork" aria-label="Choose one">${branch.forks.map(upgradeNode).join("")}</div><div class="upgrade-branch__capstone">${upgradeNode(branch.capstone)}</div></section>`;
}

export function mountAppShell(app: HTMLElement, dev = import.meta.env.DEV) {
  const devAction = (id: string) => (dev ? menuAction(id, "DEV MENU") : "");

  app.innerHTML = `
    <div class="menu-stack" id="menu-stack">
      <div class="menu menu--root" id="main-menu" data-menu-depth="0">
        ${menuRail("MENU")}
        <div class="menu__panel">
          <header class="menu__header"><h1 class="menu__title">EXOWING</h1></header>
          <div class="menu__actions">${menuAction("start-button", "START")}${menuAction("start-settings-button", "SETTINGS")}${devAction("start-dev-settings-button")}</div>
        </div>
      </div>

      <div class="menu menu--root" id="pause-menu" data-menu-depth="0" hidden>
        ${menuRail("PAUSED")}
        <div class="menu__panel">
          <header class="menu__header"><h1 class="menu__title">PAUSED</h1></header>
          <div class="menu__actions">${menuAction("continue-button", "CONTINUE")}${menuAction("settings-button", "SETTINGS")}${menuAction("controls-button", "CONTROLS")}${menuAction("main-menu-button", "MAIN MENU", undefined, "menu__action--danger")}${devAction("dev-settings-button")}</div>
        </div>
      </div>

      <div class="menu" id="settings-menu" data-menu-depth="1" hidden>
        ${menuRail("SETTINGS", "settings-back", "Back to previous menu")}
        <div class="menu__panel menu__panel--settings">
          <header class="menu__header"><h1>SETTINGS</h1></header>
          <div class="settings"><h2 class="settings__section-title">GRAPHICS</h2><div class="setting-row"><div class="setting-row__label"><span>QUALITY</span><small id="render-resolution"></small></div><select id="render-scale" aria-label="Graphics quality"><option value="0.5">LOW</option><option value="0.75">MEDIUM</option><option value="1">HIGH</option></select></div><label class="setting-row setting-toggle"><span>ANTI-ALIASING</span><input id="anti-aliasing" type="checkbox"></label><label class="setting-row setting-toggle"><span>TARGETING RETICLE</span><input id="targeting-reticle" type="checkbox"></label><h2 class="settings__section-title">AUDIO</h2><label class="setting-row setting-volume"><span>VOLUME</span><span class="setting-volume__control"><input id="master-volume" type="range" min="0" max="1" step="0.01" aria-label="Master volume"><output id="master-volume-value" for="master-volume">82%</output></span></label></div>
        </div>
      </div>

      <div class="menu" id="controls-menu" data-menu-depth="1" hidden>
        ${menuRail("CONTROLS", "controls-back", "Back to pause menu")}
        <div class="menu__panel menu__panel--compact">
          <header class="menu__header"><h1>CONTROLS</h1></header>
          <div class="controls"><dl><div><dt>MOVE / AIM</dt><dd>W A S D</dd></div><div><dt>BARREL ROLL / DODGE</dt><dd>Q / E</dd></div><div><dt>PRIMARY FIRE</dt><dd>SPACE</dd></div><div><dt>LOCK / RELEASE MISSILES</dt><dd>F</dd></div><div><dt>ACTIVATE PICKUP</dt><dd>R</dd></div><div><dt>FASTER</dt><dd>SHIFT</dd></div><div><dt>BRAKE</dt><dd>ALT</dd></div><div><dt>PAUSE</dt><dd>ESC</dd></div></dl></div>
        </div>
      </div>

      ${
        dev
          ? `<div class="menu" id="dev-menu" data-menu-depth="1" hidden>
        ${menuRail("DEV MENU", "dev-menu-back", "Back to previous menu")}
        <div class="menu__panel"><header class="menu__header"><h1>DEV MENU</h1></header><div class="menu__actions">${menuAction("start-boss-encounter", "JUMP TO BOSS", "CURRENT LEVEL · ONE HIT", "dev-boss-button")}${menuAction("start-transition-tour", "TRANSITION TOUR", "ONE ENCOUNTER PER LEVEL", "dev-tour-button")}${menuAction("open-dev-settings", "DEV SETTINGS")}${menuAction("open-level-switcher", "SWITCH LEVEL")}${menuAction("open-pickup-spawner", "SPAWN PICKUPS")}${menuAction("open-asset-scaling", "ASSET SCALING")}</div></div>
      </div>

      <div class="menu" id="dev-settings-menu" data-menu-depth="2" hidden>
        ${menuRail("DEV SETTINGS", "dev-settings-back", "Back to developer menu")}
        <div class="menu__panel menu__panel--compact"><header class="menu__header"><h1>DEV SETTINGS</h1></header><div class="dev-settings"><label class="dev-setting">INVULNERABLE <input data-dev-setting="invulnerable" type="checkbox"></label><label class="dev-setting">SHOW FPS <input data-dev-setting="showFps" type="checkbox"></label><label class="dev-setting">SHOW MOVEMENT FRAME <input data-dev-setting="showMovementFrame" type="checkbox"></label><label class="dev-setting">SHOW SPLINE <input data-dev-setting="showSpline" type="checkbox"></label><label class="dev-setting">AGX TONEMAPPING <input data-dev-setting="agxToneMapping" type="checkbox"></label></div></div>
      </div>

      <div class="menu" id="dev-level-menu" data-menu-depth="2" hidden>
        ${menuRail("LEVELS", "dev-level-back", "Back to developer menu")}
        <div class="menu__panel"><header class="menu__header"><h1>SWITCH LEVEL</h1></header><div class="dev-level-list" id="dev-level-list">${LEVEL_IDS.map((id) => `<button type="button" data-dev-level="${id}" aria-label="Level ${id}, ${LEVELS[id].name}"><span>${id.toString().padStart(2, "0")}</span>${LEVELS[id].name.toUpperCase()}</button>`).join("")}</div></div>
      </div>

      <div class="menu" id="dev-pickup-menu" data-menu-depth="2" hidden>
        ${menuRail("PICKUPS", "dev-pickup-back", "Back to developer menu")}
        <div class="menu__panel"><header class="menu__header"><h1>SPAWN PICKUPS</h1></header><div class="dev-level-list" id="dev-pickup-list">${PICKUP_IDS.map((id) => `<button type="button" data-dev-pickup="${id}" aria-label="Spawn ${PICKUPS[id].label}"><span>+</span>${PICKUPS[id].label.toUpperCase()}</button>`).join("")}</div></div>
      </div>

      <div class="menu asset-scaling-menu" id="asset-scaling-menu" data-menu-depth="2" hidden>
        ${menuRail("SCALING", "asset-scaling-back", "Back to developer menu")}
        <div class="menu__panel menu__panel--wide"><div class="asset-scaling"><header class="menu__header"><h1>ASSET SCALING</h1><p class="asset-scaling__help">SELECT UP TO THREE · DRAG TO ORBIT · SCROLL TO ZOOM</p></header><div class="asset-scaling__preview" id="asset-scaling-preview"><p id="asset-scaling-status">LOADING…</p></div><div class="asset-scaling__controls" id="asset-scaling-controls"></div><button id="copy-asset-scales" type="button">COPY SCALES</button><p class="asset-scaling__feedback" id="asset-scaling-feedback" aria-live="polite"></p></div></div>
      </div>`
          : ""
      }

      <div class="menu menu--root" id="game-over-menu" data-menu-depth="0" hidden>
        ${menuRail("FAILED")}
        <div class="menu__panel"><header class="menu__header"><h1 class="menu__title">GAME OVER</h1></header><div class="menu__actions">${menuAction("retry-button", "RETRY")}${menuAction("game-over-main-menu-button", "MAIN MENU")}</div></div>
      </div>
    </div>

    <div class="damage-vignette" id="damage-vignette" aria-hidden="true"></div><div class="level-transition" id="level-transition" aria-hidden="true"><span id="level-transition-label"></span></div>
    <div class="loading-screen" id="loading-screen" hidden aria-live="polite" aria-busy="true"><div class="loading-screen__content"><p class="loading-screen__eyebrow" id="loading-eyebrow">LEVEL 01</p><h1 id="loading-title">AZURE REACH</h1><div class="loading-screen__track"><div class="loading-screen__fill" id="loading-fill"></div></div><p class="loading-screen__status" id="loading-status">LOADING</p><button id="loading-retry" type="button" hidden>RETRY</button></div></div>
    <section class="level-intro" id="level-intro" hidden aria-live="polite" aria-label="Level introduction"><div class="level-intro__shade"></div><div class="level-intro__content"><div class="level-intro__rule" aria-hidden="true"></div><p class="level-intro__eyebrow" id="level-intro-eyebrow">LEVEL 01</p><h1 id="level-intro-title">AZURE REACH</h1></div></section>
    <section class="level-results" id="level-results" hidden aria-live="polite" aria-label="Level results"><div class="level-results__scrim"></div><div class="level-results__card"><p class="level-results__eyebrow">MISSION COMPLETE</p><h1 id="level-results-title">AZURE REACH CLEARED</h1><div class="level-results__primary"><strong id="level-results-kill-percent">100%</strong><span>ENEMIES DESTROYED</span></div><dl class="level-results__grid"><div><dt>DESTROYED</dt><dd id="level-results-enemies">11 / 11</dd></div><div><dt>ACCURACY</dt><dd id="level-results-accuracy">100%</dd></div><div><dt>SHOTS FIRED</dt><dd id="level-results-shots">0</dd></div><div><dt>DAMAGE TAKEN</dt><dd id="level-results-damage">0</dd></div><div><dt>FLIGHT TIME</dt><dd id="level-results-time">00:00</dd></div><div><dt>LEVEL SCORE</dt><dd id="level-results-score">0000</dd></div></dl><button id="level-results-continue" type="button"><span>PRESS</span><kbd>SPACE</kbd><span>TO CONTINUE</span></button></div></section>
    <section class="upgrade-screen" id="upgrade-screen" hidden aria-live="polite" aria-label="Choose a flight-system upgrade"><div class="upgrade-screen__scrim"></div><div class="upgrade-screen__panel"><header class="upgrade-screen__header"><div><p>FLIGHT SYSTEMS</p><h1>SELECT UPGRADE</h1></div><div class="upgrade-screen__mission"><span id="upgrade-next-level">NEXT SORTIE</span><strong id="upgrade-points-remaining">4 UPGRADES REMAIN AFTER THIS</strong></div></header><div class="upgrade-tree" id="upgrade-tree">${UPGRADE_BRANCHES.map(upgradeBranch).join("")}</div><aside class="upgrade-detail" aria-live="polite"><div class="upgrade-detail__copy"><span id="upgrade-detail-state">AVAILABLE</span><h2 id="upgrade-detail-label">CALIBRATED EMITTERS</h2><p id="upgrade-detail-effect">Primary weapons fire 15% faster.</p></div><dl><div><dt>UNLOCKS</dt><dd id="upgrade-detail-unlocks">Magnetic Bolts or Twin Bolts</dd></div><div><dt>TRADE-OFF</dt><dd id="upgrade-detail-tradeoff">Commits one upgrade point.</dd></div></dl><button id="upgrade-confirm" type="button">INSTALL UPGRADE</button></aside></div></section>
    <div class="hud" id="hud" hidden><div class="hud__shield"><div class="hud__eyebrow"><span>SHIELD</span><span id="shield">100%</span></div><div class="hud__shield-track" role="meter" aria-label="Shield" aria-valuemin="0" aria-valuemax="5" aria-valuenow="5"><div class="hud__shield-fill" id="shield-fill"></div></div></div><div class="hud__ordnance"><span>MISSILES</span><strong id="missile-ammo">3</strong><span id="missile-locks">HOLD F TO LOCK</span></div><div class="hud__pickup"><span>RESERVE</span><strong id="pickup-reserve">EMPTY</strong><span id="pickup-status">NO PICKUP HELD</span></div><div class="hud__score"><span class="hud__score-label">SCORE</span><span class="hud__score-value" id="score">0000</span></div><div class="hud__boss" id="boss-health" hidden><div class="hud__eyebrow"><span id="boss-health-name">GUARDIAN: RIFTMAW</span><span id="boss-health-value">100%</span></div><div class="hud__boss-track"><div class="hud__boss-fill" id="boss-health-fill"></div></div></div><div class="hud__control-hints" id="control-hints" aria-hidden="true"><div class="hud__control-hint" data-control-hint="movement"><span class="hud__control-keys hud__control-keys--wasd"><kbd class="hud__control-key--w">W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>MOVE / AIM</span></div><div class="hud__control-hint" data-control-hint="fire"><span class="hud__control-keys"><kbd class="hud__control-key--wide">SPACE</kbd></span><span>FIRE</span></div><div class="hud__control-hint" data-control-hint="dodge"><span class="hud__control-keys"><kbd>Q</kbd><i>/</i><kbd>E</kbd></span><span>DODGE</span></div></div><div class="hud__fps" id="fps" hidden>FPS 0</div></div>`;
}

export function requiredElement<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}
