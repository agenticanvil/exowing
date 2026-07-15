import type { PlayerModelId } from "../assets/gameAssets";

const PLAYER_MODEL_HOTKEYS: Readonly<Record<string, PlayerModelId>> = {
  Digit1: "plane-1",
  Numpad1: "plane-1",
  Digit2: "plane-3",
  Numpad2: "plane-3",
};

export function playerModelForHotkey(code: string) {
  return PLAYER_MODEL_HOTKEYS[code];
}
