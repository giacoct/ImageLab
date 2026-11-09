import { p } from "../core/params";
import { adjustPixels, blurPixels, sharpenPixels } from "../core/pixels";
import { editPixels, fromPixels, readPixels } from "../engine/canvas";
import { mapOp } from "./op";

const percent = (label: string, def: number, max: number) =>
  p.number({ label, default: def, min: 0, max, unit: "%" });

export const adjust = mapOp({
  id: "adjust",
  kind: "map",
  title: "Adjust & filters",
  description: "Brightness, contrast, color, blur, sharpen, and tints.",
  suffix: "adjusted",
  params: {
    brightness: percent("Brightness", 100, 200),
    contrast: percent("Contrast", 100, 200),
    saturation: percent("Saturation", 100, 200),
    grayscale: percent("Grayscale", 0, 100),
    sepia: percent("Sepia", 0, 100),
    blur: p.number({ label: "Blur", default: 0, min: 0, max: 50, unit: "px" }),
    sharpen: percent("Sharpen", 0, 100),
    invert: p.boolean({ label: "Invert colors", default: false }),
  },
  run(image, values, context) {
    editPixels(image, (pixels) => {
      adjustPixels(pixels.data, values);
      blurPixels(pixels, values.blur * context.scale);
    });
    if (values.sharpen === 0) return image;
    const pixels = readPixels(image);
    return fromPixels(
      sharpenPixels(pixels, values.sharpen / 100),
      pixels.width,
      pixels.height,
    );
  },
});
