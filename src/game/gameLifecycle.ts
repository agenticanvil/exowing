export type GameMode = 'menu' | 'playing' | 'paused' | 'transition' | 'gameover';

export class GameLifecycle {
  mode: GameMode = 'menu';

  startPlaying() { this.mode = 'playing'; }
  returnToMenu() { this.mode = 'menu'; }
  pause() {
    if (this.mode !== 'playing') return false;
    this.mode = 'paused';
    return true;
  }
  resume() {
    if (this.mode !== 'paused') return false;
    this.mode = 'playing';
    return true;
  }
  gameOver() {
    if (this.mode !== 'playing') return false;
    this.mode = 'gameover';
    return true;
  }
  beginTransition() {
    if (this.mode !== 'playing') return false;
    this.mode = 'transition';
    return true;
  }
  shouldRender() { return this.mode === 'playing' || this.mode === 'transition'; }
}
