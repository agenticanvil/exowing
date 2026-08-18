import type { PlayerCommand } from "../sim/types";

const INITIAL_HINT_DURATION_SECONDS = 8;
const DODGE_HINT_DURATION_SECONDS = 6;
const DODGE_REVEAL_DELAY_SECONDS = 2.5;

export type ControlHintVisibility = {
  movement: boolean;
  fire: boolean;
  dodge: boolean;
};

export class ControlHintGuide {
  private active = false;
  private elapsedSeconds = 0;
  private movementUsed = false;
  private fireUsed = false;
  private dodgeUsed = false;
  private hostileFireObserved = false;
  private dodgeRevealedAt: number | null = null;

  reset() {
    this.active = false;
    this.elapsedSeconds = 0;
    this.movementUsed = false;
    this.fireUsed = false;
    this.dodgeUsed = false;
    this.hostileFireObserved = false;
    this.dodgeRevealedAt = null;
  }

  start() {
    this.active = true;
  }

  stop() {
    this.active = false;
  }

  update(command: PlayerCommand, hostileFireRelevant: boolean, dt: number) {
    if (!this.active) return;
    this.elapsedSeconds += Math.max(0, dt);
    if (command.steerX !== 0 || command.steerY !== 0) this.movementUsed = true;
    if (command.fire) this.fireUsed = true;
    if (command.roll !== 0) this.dodgeUsed = true;
    this.hostileFireObserved ||= hostileFireRelevant;
    if (
      this.hostileFireObserved &&
      !this.dodgeUsed &&
      this.dodgeRevealedAt === null &&
      this.elapsedSeconds >= DODGE_REVEAL_DELAY_SECONDS
    )
      this.dodgeRevealedAt = this.elapsedSeconds;
  }

  visibility(): ControlHintVisibility {
    return {
      movement:
        this.active &&
        !this.movementUsed &&
        this.elapsedSeconds < INITIAL_HINT_DURATION_SECONDS,
      fire:
        this.active &&
        !this.fireUsed &&
        this.elapsedSeconds < INITIAL_HINT_DURATION_SECONDS,
      dodge:
        this.active &&
        !this.dodgeUsed &&
        this.dodgeRevealedAt !== null &&
        this.elapsedSeconds - this.dodgeRevealedAt <
          DODGE_HINT_DURATION_SECONDS,
    };
  }
}
