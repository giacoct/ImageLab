/** Remove background: make a background color transparent. */

import { removeBackground as remove } from "../core/background";
import { p } from "../core/params";
import { editPixels, inWorkingSpace } from "../engine/canvas";
import { mapOp } from "./op";

export const removeBackground = mapOp({
  id: "remove-background",
  kind: "map",
  title: "Remove background",
  description: "Make a plain background transparent: logos, products, scans.",
  suffix: "nobg",
  params: {
    // Detected when the tool opens, and on demand (session.detectBackground).
    color: p.color({ label: "Background color", default: "#ffffff" }),
    connected: p.boolean({
      label: "Only around the subject",
      default: true,
      hint: "Keeps the same color inside the subject, e.g. the white of a logo on white.",
    }),
    tolerance: p.number({
      label: "Tolerance",
      default: 10,
      min: 0,
      max: 60,
      unit: "%",
      hint: "How different a color can be and still count as background.",
    }),
    softness: p.number({
      label: "Edge softness",
      default: 10,
      min: 0,
      max: 40,
      unit: "%",
    }),
  },
  run(image, values) {
    // Compared with the pixels' numbers, in the working color space.
    const color = inWorkingSpace(values.color);
    return editPixels(image, (pixels) => remove(pixels, { ...values, color }));
  },
});
