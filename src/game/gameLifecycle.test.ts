import { describe, expect, it } from 'vitest';
import { GameLifecycle } from './gameLifecycle';

describe('GameLifecycle', () => {
  it('supports the play, pause, resume, and game-over flow', () => {
    const game = new GameLifecycle();
    game.startPlaying();
    expect(game.pause()).toBe(true);
    expect(game.resume()).toBe(true);
    expect(game.gameOver()).toBe(true);
    expect(game.mode).toBe('gameover');
  });

  it('only transitions levels from active play', () => {
    const game = new GameLifecycle();
    expect(game.beginTransition()).toBe(false);
    game.startPlaying();
    expect(game.beginTransition()).toBe(true);
    expect(game.shouldRender()).toBe(true);
  });

  it('can return every state to the main menu', () => {
    const game = new GameLifecycle();
    game.startPlaying();
    game.returnToMenu();
    expect(game.mode).toBe('menu');
    expect(game.shouldRender()).toBe(false);
  });
});
