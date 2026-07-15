import { describe, expect, it } from "vitest";
import { mountAppShell } from "./appShell";

describe("mountAppShell", () => {
  it("makes settings available before starting the game", () => {
    const app = { innerHTML: "" } as HTMLElement;

    mountAppShell(app, false);

    expect(app.innerHTML).toContain(
      '<button id="start-settings-button" type="button">SETTINGS</button>',
    );
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

  it("groups resolution controls under graphics", () => {
    const app = { innerHTML: "" } as HTMLElement;

    mountAppShell(app, false);

    expect(app.innerHTML).toContain(">GRAPHICS</h2>");
    expect(app.innerHTML).toContain(
      '<div class="setting-row__label"><span>RESOLUTION</span><small id="render-resolution"></small></div>',
    );
  });

  it("puts level switching in its own dev submenu", () => {
    const app = { innerHTML: "" } as HTMLElement;

    mountAppShell(app, true);

    expect(app.innerHTML).toContain(">DEV MENU</button>");
    expect(app.innerHTML).toContain('id="open-dev-settings"');
    expect(app.innerHTML.indexOf('id="open-level-switcher"')).toBeLessThan(
      app.innerHTML.indexOf('id="dev-settings-menu"'),
    );
    expect(app.innerHTML).toContain('id="dev-level-menu"');
    expect(app.innerHTML).toContain('id="dev-level-back"');
    expect(app.innerHTML).toContain('id="open-asset-scaling"');
    expect(app.innerHTML).toContain('id="asset-scaling-menu"');
  });
});
