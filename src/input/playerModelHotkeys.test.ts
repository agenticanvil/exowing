import { describe, expect, it } from "vitest";
import { playerModelForHotkey } from "./playerModelHotkeys";

describe("playerModelForHotkey", () => {
  it.each([
    ["Digit1", "plane-1"],
    ["Numpad1", "plane-1"],
    ["Digit2", "plane-3"],
    ["Numpad2", "plane-3"],
  ])("maps %s to %s", (code, model) => {
    expect(playerModelForHotkey(code)).toBe(model);
  });

  it("ignores unrelated keys", () => {
    expect(playerModelForHotkey("KeyW")).toBeUndefined();
  });
});
