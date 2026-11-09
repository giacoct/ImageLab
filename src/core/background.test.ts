import { describe, expect, it } from "vitest";

import { edgeColor, hexToRgb, removeBackground, rgbToHex } from "./background";

/** A `size`×`size` white image with a black ring and white inside it. */
function ring(size = 9) {
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      const onRing = x === 2 || y === 2 || x === size - 3 || y === size - 3;
      if (onRing) data.set([0, 0, 0, 255], (y * size + x) * 4);
    }
  }
  return { data, width: size, height: size };
}

const alpha = (image: ReturnType<typeof ring>, x: number, y: number) =>
  image.data[(y * image.width + x) * 4 + 3];

describe("background", () => {
  it("converts colors", () => {
    expect(hexToRgb("#ff8000")).toEqual([255, 128, 0]);
    expect(rgbToHex(255, 128, 0)).toBe("#ff8000");
  });

  it("finds the background color on the edges", () => {
    expect(edgeColor(ring())).toBe("#ffffff");
  });

  it("removes only the background connected to the edges", () => {
    const image = ring();
    removeBackground(image, {
      color: "#ffffff",
      tolerance: 5,
      softness: 0,
      connected: true,
    });
    expect(alpha(image, 0, 0)).toBe(0);
    expect(alpha(image, 2, 2)).toBe(255); // the ring
    expect(alpha(image, 4, 4)).toBe(255); // white inside the ring stays
  });

  it("removes the color everywhere when asked", () => {
    const image = ring();
    removeBackground(image, {
      color: "#ffffff",
      tolerance: 5,
      softness: 0,
      connected: false,
    });
    expect(alpha(image, 4, 4)).toBe(0);
    expect(alpha(image, 2, 2)).toBe(255);
  });

  it("fades colors in the soft band", () => {
    const data = new Uint8ClampedArray([
      255, 255, 255, 255, 200, 200, 200, 255, 0, 0, 0, 255,
    ]);
    removeBackground(
      { data, width: 3, height: 1 },
      { color: "#ffffff", tolerance: 5, softness: 20, connected: false },
    );
    expect(data[3]).toBe(0);
    expect(data[7]).toBeGreaterThan(0);
    expect(data[7]).toBeLessThan(255);
    expect(data[11]).toBe(255);
  });
});
