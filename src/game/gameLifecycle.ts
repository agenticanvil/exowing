export type GameMode =
  "menu" | "intro" | "playing" | "outro" | "paused" | "transition" | "gameover";

export class GameLifecycle {
  mode: GameMode = "menu";

  startIntro() {
    this.mode = "intro";
  }
  finishIntro() {
    if (this.mode !== "intro") return false;
    this.mode = "playing";
    return true;
  }
  startPlaying() {
    this.mode = "playing";
  }
  returnToMenu() {
    this.mode = "menu";
  }
  pause() {
    if (this.mode !== "playing") return false;
    this.mode = "paused";
    return true;
  }
  resume() {
    if (this.mode !== "paused") return false;
    this.mode = "playing";
    return true;
  }
  gameOver() {
    if (this.mode !== "playing") return false;
    this.mode = "gameover";
    return true;
  }
  beginOutro() {
    if (this.mode !== "playing") return false;
    this.mode = "outro";
    return true;
  }
  finishOutro() {
    if (this.mode !== "outro") return false;
    this.mode = "transition";
    return true;
  }
  beginTransition() {
    if (this.mode !== "playing") return false;
    this.mode = "transition";
    return true;
  }
  shouldRender() {
    return (
      this.mode === "intro" ||
      this.mode === "playing" ||
      this.mode === "outro" ||
      this.mode === "transition"
    );
  }
}
