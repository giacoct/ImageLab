import { describe, expect, it } from "vitest";

import { restoreSize, tracerConfig } from "./vector";

describe("vector", () => {
  it("converts settings to the converter units", () => {
    const config = tracerConfig({
      colors: "color",
      detail: 6,
      speckle: 4,
      corners: "balanced",
      curves: "spline",
    });
    expect(config).toMatchObject({
      binary: false,
      filterSpeckle: 16,
      colorPrecision: 2,
    });
    expect(config.cornerThreshold).toBeCloseTo(Math.PI / 3);
    expect(
      tracerConfig({
        colors: "bw",
        detail: 1,
        speckle: 0,
        corners: "sharp",
        curves: "polygon",
      }).binary,
    ).toBe(true);
  });

  it("restores the original size with a viewBox", () => {
    const svg = '<svg width="200" height="100"><path/></svg>';
    expect(
      restoreSize(svg, { width: 100, height: 50 }, { width: 200, height: 100 }),
    ).toBe('<svg width="100" height="50" viewBox="0 0 200 100"><path/></svg>');
    expect(
      restoreSize(
        svg,
        { width: 200, height: 100 },
        { width: 200, height: 100 },
      ),
    ).toBe(svg);
  });
});
