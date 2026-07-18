import { describe, expect, it } from "vitest";
import { mountAppShell } from "./appShell";

describe("mountAppShell", () => {
  it("makes settings available before starting the game", () => {
    const app = { innerHTML: "" } as HTMLElement;

    mountAppShell(app, false);

    expect(app.innerHTML).toContain('id="start-settings-button"');
    expect(app.innerHTML).toContain('aria-label="SETTINGS"');
  });

  it("renders an accessible master volume control", () => {
    const app = { innerHTML: "" } as HTMLElement;

    mountAppShell(app, false);

    expect(app.innerHTML).toContain(">AUDIO</h2>");
    expect(app.innerHTML).toContain(
      'id="master-volume" type="range" min="0" max="1" step="0.01" aria-label="Master volume"',
    );
    expect(app.innerHTML).toContain(
      'id="master-volume-value" for="master-volume"',
    );
  });

  it("groups graphics quality controls under graphics", () => {
    const app = { innerHTML: "" } as HTMLElement;

    mountAppShell(app, false);

    expect(app.innerHTML).toContain(">GRAPHICS</h2>");
    expect(app.innerHTML).toContain(
      '<div class="setting-row__label"><span>QUALITY</span><small id="render-resolution"></small></div>',
    );
  });

  it("puts level switching in its own dev submenu", () => {
    const app = { innerHTML: "" } as HTMLElement;

    mountAppShell(app, true);

    expect(app.innerHTML).toContain("<h1>DEV MENU</h1>");
    expect(app.innerHTML).toContain('id="open-dev-settings"');
    expect(app.innerHTML.indexOf('id="open-level-switcher"')).toBeLessThan(
      app.innerHTML.indexOf('id="dev-settings-menu"'),
    );
    expect(app.innerHTML).toContain('id="dev-level-menu"');
    expect(app.innerHTML).toContain('id="dev-level-back"');
    expect(app.innerHTML).toContain('id="open-asset-scaling"');
    expect(app.innerHTML).toContain('id="asset-scaling-menu"');
    expect(app.innerHTML).toContain('id="open-pickup-spawner"');
    expect(app.innerHTML).toContain('id="dev-pickup-menu"');
    expect(app.innerHTML).toContain('data-dev-pickup="shield"');
    expect(app.innerHTML).toContain('data-dev-pickup="chain-lightning"');
    expect(app.innerHTML).toContain('id="start-transition-tour"');
    expect(app.innerHTML).toContain("ONE ENCOUNTER PER LEVEL");
  });

  it("offers AgX tone mapping in developer settings", () => {
    const app = { innerHTML: "" } as HTMLElement;

    mountAppShell(app, true);

    expect(app.innerHTML).toContain(
      'AGX TONEMAPPING <input data-dev-setting="agxToneMapping" type="checkbox">',
    );
  });

  it("includes the level introduction overlay", () => {
    const app = { innerHTML: "" } as HTMLElement;

    mountAppShell(app, false);

    expect(app.innerHTML).toContain('id="level-intro"');
    expect(app.innerHTML).toContain('id="level-intro-eyebrow"');
    expect(app.innerHTML).toContain('id="level-intro-title"');
    expect(app.innerHTML).not.toContain("BEGIN APPROACH");
  });

  it("includes the animated level results card", () => {
    const app = { innerHTML: "" } as HTMLElement;

    mountAppShell(app, false);

    expect(app.innerHTML).toContain('id="level-results"');
    expect(app.innerHTML).toContain('id="level-results-kill-percent"');
    expect(app.innerHTML).toContain('id="level-results-accuracy"');
    expect(app.innerHTML).toContain('id="level-results-damage"');
    expect(app.innerHTML).toContain('id="level-results-continue"');
  });

  it("keeps the between-level cover free of a level-number card", () => {
    const app = { innerHTML: "" } as HTMLElement;

    mountAppShell(app, false);

    expect(app.innerHTML).toContain(
      '<div class="level-transition" id="level-transition" aria-hidden="true"><span id="level-transition-label"></span></div>',
    );
  });

  it("renders menus as a labeled horizontal hierarchy", () => {
    const app = { innerHTML: "" } as HTMLElement;

    mountAppShell(app, true);

    expect(app.innerHTML).toContain('class="menu-stack" id="menu-stack"');
    expect(app.innerHTML).toContain('id="main-menu" data-menu-depth="0"');
    expect(app.innerHTML).toContain('id="settings-menu" data-menu-depth="1"');
    expect(app.innerHTML).toContain(
      'id="dev-settings-menu" data-menu-depth="2"',
    );
    expect(app.innerHTML).toContain('class="menu__rail-label">SETTINGS');
  });

  it("keeps standard player-facing copy concise", () => {
    const app = { innerHTML: "" } as HTMLElement;

    mountAppShell(app, false);

    expect(app.innerHTML).not.toContain("menu__description");
    expect(app.innerHTML).not.toContain("menu__eyebrow");
    expect(app.innerHTML).not.toContain("asset manifest");
    expect(app.innerHTML).not.toContain("BUILDING WORLD");
    expect(app.innerHTML).toContain(
      '<p class="loading-screen__status" id="loading-status">LOADING</p>',
    );
  });
});
