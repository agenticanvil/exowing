import { describe, expect, it, vi } from "vitest";
import { createWorld, type WorldSystemDefinition } from "./worldSystem";

describe("WorldRuntime", () => {
  it("runs arbitrary composed systems without knowing their concrete types", () => {
    const firstStep = vi.fn();
    const secondStep = vi.fn();
    const definitions: WorldSystemDefinition[] = [
      { create: () => ({ id: "terrain", step: firstStep }) },
      { create: () => ({ id: "particles", step: secondStep }) },
    ];
    const world = createWorld(definitions);

    world.step(125);

    expect(firstStep).toHaveBeenCalledWith(
      expect.objectContaining({ railDistance: 125 }),
    );
    expect(secondStep).toHaveBeenCalledWith(
      expect.objectContaining({ railDistance: 125 }),
    );
  });
});
