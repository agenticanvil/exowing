import type { PlayerCommand } from "../sim/types";

export class InputState {
  private readonly pressed = new Set<string>();
  private enabled = true;
  private pendingFire = false;
  private pendingRoll = 0;

  constructor(
    private readonly target: Pick<
      Window,
      "addEventListener" | "removeEventListener"
    > = window,
  ) {
    target.addEventListener(
      "keydown",
      this.onKeyDown as unknown as EventListener,
    );
    target.addEventListener("keyup", this.onKeyUp as unknown as EventListener);
    target.addEventListener("blur", this.clear);
  }

  dispose() {
    this.target.removeEventListener(
      "keydown",
      this.onKeyDown as unknown as EventListener,
    );
    this.target.removeEventListener(
      "keyup",
      this.onKeyUp as unknown as EventListener,
    );
    this.target.removeEventListener("blur", this.clear);
    this.clear();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.clear();
  }

  command(): PlayerCommand {
    const command = {
      steerX: axis(this.pressed.has("KeyA"), this.pressed.has("KeyD")),
      steerY: axis(this.pressed.has("KeyS"), this.pressed.has("KeyW")),
      fire: this.pressed.has("Space") || this.pendingFire,
      pace: axis(
        this.pressed.has("AltLeft") || this.pressed.has("AltRight"),
        this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight"),
      ),
      roll: this.pendingRoll,
    };
    this.pendingFire = false;
    this.pendingRoll = 0;
    return command;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (!this.enabled) return;
    if (event.code === "Space" || event.code.startsWith("Alt"))
      event.preventDefault();
    if (!event.repeat && event.code === "Space") this.pendingFire = true;
    if (!event.repeat && (event.code === "KeyQ" || event.code === "KeyE")) {
      this.pendingRoll = event.code === "KeyQ" ? -1 : 1;
    }
    this.pressed.add(event.code);
  };
  private onKeyUp = (event: KeyboardEvent) => this.pressed.delete(event.code);
  private clear = () => {
    this.pressed.clear();
    this.pendingFire = false;
    this.pendingRoll = 0;
  };
}

function axis(negative: boolean, positive: boolean) {
  return Number(positive) - Number(negative);
}
