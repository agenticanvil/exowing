import { describe, expect, it } from "vitest";
import { serializeAssetScales } from "./assetScaleTool";

describe("serializeAssetScales", () => {
  it("creates a compact handoff with stable scale precision", () => {
    expect(
      serializeAssetScales([
        ["player/plane-1", 0.5600001],
        ["enemies/riftmaw", 0.541044776],
      ]),
    ).toBe(`{
  "assetScales": {
    "player/plane-1": 0.56,
    "enemies/riftmaw": 0.541
  }
}`);
  });
});
