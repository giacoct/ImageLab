/** Merge images: combine all the images into one, stacked or side by side. */

import { mergeLayout } from "../core/geometry";
import { p, type AnyValues } from "../core/params";
import { context2d, createCanvas } from "../engine/canvas";
import { combineOp } from "./op";

/** Stacked: the images line up left to right; side by side, top to bottom. */
const stacked = (v: AnyValues) => v.direction === "vertical";
/** The alignment's label and icon, which follow the direction. */
const across = (vertical: string, horizontal: string) => (v: AnyValues) =>
  stacked(v) ? vertical : horizontal;

export const merge = combineOp({
  id: "merge",
  kind: "combine",
  title: "Merge images",
  description: "Combine all the images into one, in the order of the list.",
  suffix: "merged",
  params: {
    direction: p.choice({
      label: "Direction",
      default: "vertical",
      options: [
        { value: "vertical", label: "Stacked", icon: "rows-2" },
        { value: "horizontal", label: "Side by side", icon: "columns-2" },
      ],
    }),
    align: p.choice({
      label: "Alignment",
      default: "center",
      display: "icons",
      options: [
        {
          value: "start",
          label: across("Left", "Top"),
          icon: across("align-start-vertical", "align-start-horizontal"),
        },
        {
          value: "center",
          label: across("Center", "Middle"),
          icon: across("align-center-vertical", "align-center-horizontal"),
        },
        {
          value: "end",
          label: across("Right", "Bottom"),
          icon: across("align-end-vertical", "align-end-horizontal"),
        },
      ],
    }),
    match: p.boolean({
      label: across("Make them the same width", "Make them the same height"),
      default: false,
    }),
    gap: p.number({
      label: "Gap",
      default: 0,
      min: 0,
      max: 1000,
      unit: "px",
      slider: false,
    }),
    transparent: p.boolean({ label: "Transparent background", default: false }),
    background: p.color({
      label: "Background",
      default: "#ffffff",
      when: (v) => !v.transparent,
    }),
  },
  run(images, values, context) {
    const layout = mergeLayout(images, {
      ...values,
      gap: values.gap * context.scale,
    });
    const out = createCanvas(layout.width, layout.height);
    const ctx = context2d(out);
    if (!values.transparent) {
      ctx.fillStyle = values.background;
      ctx.fillRect(0, 0, out.width, out.height);
    }
    layout.places.forEach((place, i) =>
      ctx.drawImage(images[i], place.x, place.y, place.width, place.height),
    );
    return out;
  },
});
