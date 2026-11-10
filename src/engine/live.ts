/**
 * The live preview of Adjust & filters, drawn on the GPU (WebGL2) on the
 * main thread. The engine renders the plain image once; every move of a
 * slider then only redraws it here, within the frame. The shaders follow
 * `core/pixels.ts` step by step (adjust, three box blurs on premultiplied
 * colors, sharpen), so the preview matches what applying makes in the
 * worker, to a level or two of rounding.
 */

import { blurBox, colorMatrix, type Adjustments } from "../core/pixels";

/** The tools previewed here: only Adjust & filters. */
export const isLive = (opId: string): boolean => opId === "adjust";

/** Adjust & filters' settings. */
export interface LiveSettings extends Adjustments {
  /** Pixels at full size. */
  blur: number;
  /** Percent. */
  sharpen: number;
}

type Source = TexImageSource & { width: number; height: number };

// One triangle covering the viewport; shaders address texels by gl_FragCoord.
const VERTEX = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const HEADER = `#version 300 es
precision highp float;
uniform sampler2D image;
out vec4 color;
`;

/** Brightness → contrast → color matrix → invert, rounded to 8 bits like the worker's; premultiplied out. */
const ADJUST = `${HEADER}
uniform float brightness, contrast;
uniform mat3 matrix;
uniform bool invert;
void main() {
  vec4 pixel = texelFetch(image, ivec2(gl_FragCoord.xy), 0);
  vec3 c = min(pixel.rgb * brightness, 1.0) * contrast + 0.5 * (1.0 - contrast);
  c = matrix * (floor(clamp(c, 0.0, 1.0) * 255.0 + 0.5) / 255.0);
  if (invert) c = 1.0 - clamp(c, 0.0, 1.0);
  c = floor(clamp(c, 0.0, 1.0) * 255.0 + 0.5) / 255.0;
  color = vec4(c * pixel.a, pixel.a);
}`;

/** One box-blur pass along \`direction\`, clamping at the edges. */
const BLUR = `${HEADER}
uniform ivec2 direction;
uniform int radius;
void main() {
  ivec2 last = textureSize(image, 0) - 1;
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 sum = vec4(0.0);
  for (int i = -radius; i <= radius; i++)
    sum += texelFetch(image, clamp(at + direction * i, ivec2(0), last), 0);
  color = sum / float(2 * radius + 1);
}`;

/** Back to straight colors, sharpen, and out to the canvas (flipped: its rows go up). */
const OUTPUT = `${HEADER}
uniform float sharpen;
ivec2 last;
vec3 straight(ivec2 at) {
  vec4 p = texelFetch(image, clamp(at, ivec2(0), last), 0);
  return p.a > 0.0 ? clamp(p.rgb / p.a, 0.0, 1.0) : vec3(0.0);
}
void main() {
  last = textureSize(image, 0) - 1;
  ivec2 at = ivec2(int(gl_FragCoord.x), last.y - int(gl_FragCoord.y));
  float alpha = texelFetch(image, at, 0).a;
  vec3 c = straight(at) * (1.0 + 4.0 * sharpen) - sharpen * (
    straight(at + ivec2(0, 1)) + straight(at - ivec2(0, 1)) +
    straight(at + ivec2(1, 0)) + straight(at - ivec2(1, 0)));
  color = vec4(clamp(c, 0.0, 1.0) * alpha, alpha);
}`;

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
}

export class LiveAdjust {
  private readonly adjust: Program;
  private readonly blur: Program;
  private readonly output: Program;
  private readonly source: WebGLTexture;
  /** Ping-pong buffers between passes, premultiplied, at half-float precision if the GPU can. */
  private targets: [Target, Target] | null = null;
  /** The source on the GPU (it may be closed since), and its size. */
  private uploaded: Source | null = null;
  private size = { width: 0, height: 0 };
  private space: PredefinedColorSpace = "srgb";
  private readonly precise: boolean;
  private readonly onLost: (event: Event) => void;

  /**
   * A renderer drawing on `canvas`, or null without WebGL2. If the GPU drops
   * the context later, `lost` is called: the caller falls back to the worker.
   */
  static create(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    lost: () => void = () => {},
  ): LiveAdjust | null {
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      depth: false,
      stencil: false,
    }) as WebGL2RenderingContext | null;
    if (!gl) return null;
    try {
      return new LiveAdjust(canvas, gl, lost);
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    private readonly gl: WebGL2RenderingContext,
    lost: () => void,
  ) {
    this.adjust = this.compile(ADJUST, [
      "brightness",
      "contrast",
      "matrix",
      "invert",
    ]);
    this.blur = this.compile(BLUR, ["direction", "radius"]);
    this.output = this.compile(OUTPUT, ["sharpen"]);
    this.source = this.texture();
    this.precise =
      !!gl.getExtension("EXT_color_buffer_float") ||
      !!gl.getExtension("EXT_color_buffer_half_float");
    // Drawing without vertex data still needs a vertex array bound.
    gl.bindVertexArray(gl.createVertexArray());
    this.onLost = (event) => {
      event.preventDefault();
      lost();
    };
    canvas.addEventListener("webglcontextlost", this.onLost);
  }

  /**
   * Draw `source` adjusted by `settings`; `scale` is its size relative to the
   * full-size image (blur is given in full-size pixels). The canvas takes the
   * size of the source. The math runs on the numbers of its color space, as
   * the worker's does (Display P3 for a wide-gamut image), and the canvas
   * shows them in it.
   */
  draw(
    source: Source,
    settings: LiveSettings,
    scale: number,
    colorSpace: PredefinedColorSpace = "srgb",
  ): void {
    const { gl } = this;
    if (gl.isContextLost()) return;
    const { width, height } = source;
    if (colorSpace !== this.space) {
      gl.drawingBufferColorSpace = colorSpace;
      gl.unpackColorSpace = colorSpace;
      this.space = colorSpace;
      this.uploaded = null;
    }
    if (source !== this.uploaded) this.upload(source);
    const [a, b] = this.targets!;

    this.pass(this.adjust, this.source, a.framebuffer, (u) => {
      gl.uniform1f(u.brightness, settings.brightness / 100);
      gl.uniform1f(u.contrast, settings.contrast / 100);
      gl.uniformMatrix3fv(u.matrix, true, colorMatrix(settings) ?? IDENTITY);
      gl.uniform1i(u.invert, settings.invert ? 1 : 0);
    });

    const radius = blurBox(settings.blur * scale);
    if (radius > 0) {
      for (let round = 0; round < 3; round++) {
        for (const [from, to, direction] of [
          [a, b, [1, 0]],
          [b, a, [0, 1]],
        ] as const) {
          this.pass(this.blur, from.texture, to.framebuffer, (u) => {
            gl.uniform2i(u.direction, direction[0], direction[1]);
            gl.uniform1i(u.radius, radius);
          });
        }
      }
    }

    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.pass(this.output, a.texture, null, (u) => {
      gl.uniform1f(u.sharpen, settings.sharpen / 100);
    });
  }

  /** Free the GPU memory now, rather than whenever the canvas is collected. */
  dispose(): void {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  private upload(source: Source): void {
    const { gl } = this;
    const { width, height } = source;
    gl.bindTexture(gl.TEXTURE_2D, this.source);
    // Straight colors, as the worker reads them.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (width !== this.size.width || height !== this.size.height) {
      for (const target of this.targets ?? []) {
        gl.deleteTexture(target.texture);
        gl.deleteFramebuffer(target.framebuffer);
      }
      this.targets = [this.target(width, height), this.target(width, height)];
    }
    this.uploaded = source;
    this.size = { width, height };
  }

  private pass(
    program: Program,
    input: WebGLTexture,
    framebuffer: WebGLFramebuffer | null,
    setUniforms: (uniforms: Program["uniforms"]) => void,
  ): void {
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const { width, height } = this.size;
    gl.viewport(0, 0, width, height);
    gl.useProgram(program.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(program.uniforms.image, 0);
    setUniforms(program.uniforms);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private texture(): WebGLTexture {
    const { gl } = this;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private target(width: number, height: number): Target {
    const { gl } = this;
    const texture = this.texture();
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const attach = (precise: boolean) => {
      if (precise)
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA16F,
          width,
          height,
          0,
          gl.RGBA,
          gl.HALF_FLOAT,
          null,
        );
      else
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          width,
          height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          null,
        );
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0,
      );
      return (
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
      );
    };
    if (!attach(this.precise) && !attach(false))
      throw new Error("This GPU cannot render the preview.");
    return { texture, framebuffer };
  }

  private compile(fragment: string, names: string[]): Program {
    const { gl } = this;
    const program = gl.createProgram();
    for (const [type, code] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(`Preview shader: ${gl.getProgramInfoLog(program)}`);
    const uniforms: Program["uniforms"] = {
      image: gl.getUniformLocation(program, "image"),
    };
    for (const name of names)
      uniforms[name] = gl.getUniformLocation(program, name);
    return { program, uniforms };
  }
}
