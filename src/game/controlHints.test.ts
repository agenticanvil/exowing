import { describe, expect, it } from "vitest";
import type { PlayerCommand } from "../sim/types";
import { ControlHintGuide } from "./controlHints";

const idleCommand: PlayerCommand = {
  steerX: 0,
  steerY: 0,
  fire: false,
  secondary: false,
  activatePickup: false,
  pace: 0,
  roll: 0,
};

describe("ControlHintGuide", () => {
  it("shows movement and fire when gameplay starts", () => {
    const guide = new ControlHintGuide();
    guide.start();

    expect(guide.visibility()).toEqual({
      movement: true,
      fire: true,
      dodge: false,
    });
  });

  it("dismisses initial hints independently when their controls are used", () => {
    const guide = new ControlHintGuide();
    guide.start();
    guide.update({ ...idleCommand, steerX: 1 }, false, 1 / 60);

    expect(guide.visibility()).toMatchObject({ movement: false, fire: true });

    guide.update({ ...idleCommand, fire: true }, false, 1 / 60);
    expect(guide.visibility()).toMatchObject({ movement: false, fire: false });
  });

  it("reveals dodge for hostile fire and dismisses it after a roll", () => {
    const guide = new ControlHintGuide();
    guide.start();
    guide.update(idleCommand, true, 1);

    expect(guide.visibility().dodge).toBe(false);

    guide.update(idleCommand, false, 1.5);
    expect(guide.visibility().dodge).toBe(true);

    guide.update({ ...idleCommand, roll: -1 }, true, 1 / 60);
    expect(guide.visibility().dodge).toBe(false);
  });

  it("does not teach a dodge the player already discovered", () => {
    const guide = new ControlHintGuide();
    guide.start();
    guide.update({ ...idleCommand, roll: 1 }, false, 1);
    guide.update(idleCommand, true, 1);

    expect(guide.visibility().dodge).toBe(false);
  });

  it("expires hints without blocking gameplay", () => {
    const guide = new ControlHintGuide();
    guide.start();
    guide.update(idleCommand, false, 8);

    expect(guide.visibility()).toEqual({
      movement: false,
      fire: false,
      dodge: false,
    });
  });
});
