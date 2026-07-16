import { describe, expect, it } from "vitest";
import { GameLifecycle } from "./gameLifecycle";

describe("GameLifecycle", () => {
  it("renders the level intro without allowing gameplay actions", () => {
    const game = new GameLifecycle();
    game.startIntro();

    expect(game.mode).toBe("intro");
    expect(game.shouldRender()).toBe(true);
    expect(game.pause()).toBe(false);
    expect(game.beginTransition()).toBe(false);
    expect(game.finishIntro()).toBe(true);
    expect(game.mode).toBe("playing");
  });

  it("supports the play, pause, resume, and game-over flow", () => {
    const game = new GameLifecycle();
    game.startPlaying();
    expect(game.pause()).toBe(true);
    expect(game.resume()).toBe(true);
    expect(game.gameOver()).toBe(true);
    expect(game.mode).toBe("gameover");
  });

  it("runs a non-interactive outro before the level transition", () => {
    const game = new GameLifecycle();
    game.startPlaying();

    expect(game.beginOutro()).toBe(true);
    expect(game.mode).toBe("outro");
    expect(game.shouldRender()).toBe(true);
    expect(game.pause()).toBe(false);
    expect(game.finishOutro()).toBe(true);
    expect(game.mode).toBe("transition");
  });

  it("only transitions levels from active play", () => {
    const game = new GameLifecycle();
    expect(game.beginTransition()).toBe(false);
    game.startPlaying();
    expect(game.beginTransition()).toBe(true);
    expect(game.shouldRender()).toBe(true);
  });

  it("can return every state to the main menu", () => {
    const game = new GameLifecycle();
    game.startPlaying();
    game.returnToMenu();
    expect(game.mode).toBe("menu");
    expect(game.shouldRender()).toBe(false);
  });
});
