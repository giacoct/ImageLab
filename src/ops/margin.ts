/** Add margin: surround the image with a colored or transparent border. */

import { marginPixels } from "../core/geometry";
import { p } from "../core/params";
import { context2d, createCanvas } from "../engine/canvas";
import { mapOp } from "./op";

const side = (label: string) =>
  p.number({
    label,
    default: 40,
    min: 0,
    max: 5000,
    slider: false,
    when: (v) => !v.same,
  });

export const margin = mapOp({
  id: "margin",
  kind: "map",
  title: "Add margin",
  description: "Surround the image with a colored or transparent border.",
  suffix: "margin",
  params: {
    unit: p.choice({
      label: "Measured in",
      default: "px",
      options: [
        { value: "px", label: "Pixels" },
        { value: "percent", label: "% of the shorter side" },
      ],
    }),
    same: p.boolean({ label: "Same on every side", default: true }),
    size: p.number({
      label: "Margin",
      default: 40,
      min: 0,
      max: 5000,
      slider: false,
      when: (v) => Boolean(v.same),
    }),
    top: side("Top"),
    right: side("Right"),
    bottom: side("Bottom"),
    left: side("Left"),
    transparent: p.boolean({ label: "Transparent", default: false }),
    color: p.color({
      label: "Color",
      default: "#ffffff",
      when: (v) => !v.transparent,
    }),
  },
  run(image, values, context) {
    const sides = values.same
      ? {
          top: values.size,
          right: values.size,
          bottom: values.size,
          left: values.size,
        }
      : values;
    // Measured on the full-size image, then brought to this one's scale.
    const full = {
      width: image.width / context.scale,
      height: image.height / context.scale,
    };
    const px = marginPixels(sides, values.unit, full);
    const [top, right, bottom, left] = [
      px.top,
      px.right,
      px.bottom,
      px.left,
    ].map((n) => Math.round(n * context.scale));

    const out = createCanvas(
      image.width + left + right,
      image.height + top + bottom,
    );
    const ctx = context2d(out);
    if (!values.transparent) {
      ctx.fillStyle = values.color;
      ctx.fillRect(0, 0, out.width, out.height);
    }
    ctx.drawImage(image, left, top);
    return out;
  },
});
