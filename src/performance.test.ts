import { describe, expect, it } from "vitest";
import { summarize } from "./performance";

describe("performance statistics", () => {
  it("summarizes frame timing percentiles", () => {
    expect(summarize([1, 2, 3, 4, 20])).toEqual({
      count: 5,
      avg: 6,
      p50: 3,
      p95: 20,
      p99: 20,
      min: 1,
      max: 20,
    });
  });
});
