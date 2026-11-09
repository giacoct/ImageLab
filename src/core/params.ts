/**
 * Declarative settings schemas. An operation declares its settings once with
 * these builders; the schema gives the defaults and drives the generated form
 * in the UI (`ParamForm`).
 */

/** Read-only view of a whole settings object, for `when`. */
export type AnyValues = Readonly<Record<string, unknown>>;

/** A text, or one that depends on the other settings (e.g. on a direction). */
export type Text = string | ((values: AnyValues) => string);

/** The text as shown with these settings. */
export function textOf(text: Text, values: AnyValues): string {
  return typeof text === "function" ? text(values) : text;
}

interface BaseParam<T> {
  label: Text;
  default: T;
  hint?: string;
  /** Show the field only when this returns true (the value is kept either way). */
  when?: (values: AnyValues) => boolean;
}

export interface NumberParam extends BaseParam<number> {
  kind: "number";
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** Range slider (true) or a number box (false). */
  slider: boolean;
}

export interface ChoiceOption<V extends string = string> {
  value: V;
  label: Text;
  /** A Lucide icon's name (the UI maps it, see `ui/icons.ts`). */
  icon?: Text;
}

export interface ChoiceParam<V extends string = string> extends BaseParam<V> {
  kind: "choice";
  options: readonly ChoiceOption<V>[];
  /**
   * Buttons side by side (with their icons, if any), buttons with only
   * their icons (the label is their tooltip), or a drop-down for long lists.
   */
  display: "segmented" | "icons" | "select";
}

export interface BooleanParam extends BaseParam<boolean> {
  kind: "boolean";
}

/** A `#rrggbb` color. */
export interface ColorParam extends BaseParam<string> {
  kind: "color";
}

/** A value edited by a custom editor (e.g. the crop box), never by the generated form. */
export interface CustomParam<T> extends BaseParam<T> {
  kind: "custom";
}

export type Param =
  NumberParam | ChoiceParam | BooleanParam | ColorParam | CustomParam<unknown>;

export type Schema = Readonly<Record<string, Param>>;

type ValueOf<P> = P extends BaseParam<infer T> ? T : never;

/** The settings object a schema describes. */
export type Values<S extends Schema> = {
  -readonly [K in keyof S]: ValueOf<S[K]>;
};

type Common<T> = Pick<BaseParam<T>, "label" | "default" | "hint" | "when">;

export const p = {
  number(
    options: Common<number> & {
      min: number;
      max: number;
      step?: number;
      unit?: string;
      slider?: boolean;
    },
  ): NumberParam {
    return { kind: "number", slider: true, step: 1, ...options };
  },

  choice<const V extends string>(
    options: Common<V> & {
      options: readonly ChoiceOption<V>[];
      display?: ChoiceParam["display"];
    },
  ): ChoiceParam<V> {
    return {
      kind: "choice",
      display: options.options.length > 4 ? "select" : "segmented",
      ...options,
    };
  },

  boolean(options: Common<boolean>): BooleanParam {
    return { kind: "boolean", ...options };
  },

  color(options: Common<string>): ColorParam {
    return { kind: "color", ...options };
  },

  custom<T>(options: Common<T>): CustomParam<T> {
    return { kind: "custom", ...options };
  },
};

/** The schema's default settings. */
export function defaults<S extends Schema>(schema: S): Values<S> {
  return Object.fromEntries(
    Object.entries(schema).map(([key, param]) => [
      key,
      structuredClone(param.default),
    ]),
  ) as Values<S>;
}
