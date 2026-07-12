import type { PlayerCommand } from '../sim/types';

export class InputState {
  private readonly pressed = new Set<string>();
  private pendingRoll = 0;

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
  }

  command(): PlayerCommand {
    const command = {
      steerX: axis(this.pressed.has('KeyA'), this.pressed.has('KeyD')),
      steerY: axis(this.pressed.has('KeyS'), this.pressed.has('KeyW')),
      fire: this.pressed.has('Space'),
      pace: axis(this.pressed.has('AltLeft') || this.pressed.has('AltRight'),
        this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight')),
      roll: this.pendingRoll,
    };
    this.pendingRoll = 0;
    return command;
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'Space' || event.code.startsWith('Alt')) event.preventDefault();
    if (!event.repeat && (event.code === 'KeyQ' || event.code === 'KeyE')) {
      this.pendingRoll = event.code === 'KeyQ' ? -1 : 1;
    }
    this.pressed.add(event.code);
  };
  private onKeyUp = (event: KeyboardEvent) => this.pressed.delete(event.code);
  private clear = () => {
    this.pressed.clear();
    this.pendingRoll = 0;
  };
}

function axis(negative: boolean, positive: boolean) {
  return Number(positive) - Number(negative);
}
