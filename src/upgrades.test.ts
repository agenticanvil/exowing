import { describe, expect, it } from "vitest";
import {
  availableUpgrades,
  hasUpgradeAfterLevel,
  UPGRADES,
  UPGRADE_BRANCHES,
  UPGRADE_IDS,
  upgradeStatus,
} from "./upgrades";

describe("campaign upgrades", () => {
  it("awards one upgrade after each of the first five levels", () => {
    expect([1, 2, 3, 4, 5, 6].map(hasUpgradeAfterLevel)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it("starts with the three specialization roots available", () => {
    expect(availableUpgrades([])).toEqual([
      "calibrated-emitters",
      "faster-lock",
      "reinforced-shield",
    ]);
  });

  it("unlocks a fork and excludes its sibling once selected", () => {
    expect(upgradeStatus("magnetic-bolts", ["calibrated-emitters"])).toBe(
      "available",
    );
    expect(upgradeStatus("overdrive-core", ["calibrated-emitters"])).toBe(
      "locked",
    );
    expect(
      upgradeStatus("twin-bolts", ["calibrated-emitters", "magnetic-bolts"]),
    ).toBe("excluded");
    expect(
      upgradeStatus("overdrive-core", [
        "calibrated-emitters",
        "magnetic-bolts",
      ]),
    ).toBe("available");
  });

  it("defines complete three-tier branches and player-facing copy", () => {
    expect(Object.keys(UPGRADES)).toEqual(UPGRADE_IDS);
    expect(UPGRADE_BRANCHES).toHaveLength(3);
    expect(
      Object.values(UPGRADES).every(
        (upgrade) =>
          upgrade.label &&
          upgrade.detail &&
          upgrade.tier >= 1 &&
          upgrade.tier <= 3,
      ),
    ).toBe(true);
  });
});
