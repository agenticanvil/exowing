import { describe, expect, it } from "vitest";
import { exhaustResponse } from "./jetExhaustView";

describe("exhaustResponse", () => {
  it("grows longer and brighter with forward speed", () => {
    const slow = exhaustResponse(6, 0);
    const fast = exhaustResponse(25, 0);
    expect(fast.length).toBeGreaterThan(slow.length);
    expect(fast.power).toBeGreaterThan(slow.power);
  });

  it("flares on acceleration and sputters down under braking", () => {
    const boost = exhaustResponse(12, 14);
    const brake = exhaustResponse(12, -14);
    expect(boost.length).toBeGreaterThan(brake.length);
    expect(brake.turbulence).toBeGreaterThan(boost.turbulence);
  });
});
