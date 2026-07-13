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
});
