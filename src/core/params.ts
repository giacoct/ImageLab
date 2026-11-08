/**
 * Declarative settings schemas. An operation declares
 * its settings once with these builders; the same schema then produces the
 * defaults, validates values restored from storage, and drives the generated
 * form in the UI (`ParamForm`).
 */

/** Read-only view of a whole settings object, for `when` / dynamic labels. */
export type AnyValues = Readonly<Record<string, unknown>>;

type Label = string | ((values: AnyValues) => string);

interface BaseParam<T> {
  label: Label;
  default: T;
  hint?: string;
  /** Show the field only when this returns true (the value is kept either way). */
  when?: (values: AnyValues) => boolean;
  /** Coerce an untrusted value (e.g. from localStorage) into a valid one. */
  sanitize(raw: unknown): T;
}

export interface NumberParam extends BaseParam<number> {
  kind: 'number';
  min: number;
  max: number;
  step: number;
  unit?: string | ((values: AnyValues) => string);
  /** Range slider (true) or a number box (false). */
  slider: boolean;
}

export interface ChoiceOption<V extends string> {
  value: V;
  label: string | ((values: AnyValues) => string);
}

export interface ChoiceParam<V extends string = string> extends BaseParam<V> {
  kind: 'choice';
  options: readonly ChoiceOption<V>[];
  /** Buttons side by side, or a drop-down for long lists. */
  display: 'segmented' | 'select';
}

export interface BooleanParam extends BaseParam<boolean> {
  kind: 'boolean';
}

export interface ColorParam extends BaseParam<string> {
  kind: 'color';
}

/** A value edited by a custom editor (e.g. the crop box), never by the generated form. */
export interface CustomParam<T> extends BaseParam<T> {
  kind: 'custom';
}

export type Param = NumberParam | ChoiceParam | BooleanParam | ColorParam | CustomParam<unknown>;

export type Schema = Readonly<Record<string, Param>>;

type ValueOf<P> = P extends BaseParam<infer T> ? T : never;

/** The settings object a schema describes. */
export type Values<S extends Schema> = { -readonly [K in keyof S]: ValueOf<S[K]> };

type Common<T> = Pick<BaseParam<T>, 'label' | 'default' | 'hint' | 'when'>;

export const p = {
  number(
    options: Common<number> & {
      min: number;
      max: number;
      step?: number;
      unit?: NumberParam['unit'];
      slider?: boolean;
    },
  ): NumberParam {
    const step = options.step ?? 1;
    return {
      kind: 'number',
      slider: true,
      ...options,
      step,
      sanitize: (raw) => {
        const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : options.default;
        return Math.min(options.max, Math.max(options.min, value));
      },
    };
  },

  choice<const V extends string>(
    options: Common<V> & {
      options: readonly ChoiceOption<V>[];
      display?: 'segmented' | 'select';
    },
  ): ChoiceParam<V> {
    return {
      kind: 'choice',
      display: options.options.length > 4 ? 'select' : 'segmented',
      ...options,
      sanitize: (raw) =>
        options.options.some((option) => option.value === raw) ? (raw as V) : options.default,
    };
  },

  boolean(options: Common<boolean>): BooleanParam {
    return {
      kind: 'boolean',
      ...options,
      sanitize: (raw) => (typeof raw === 'boolean' ? raw : options.default),
    };
  },

  color(options: Common<string>): ColorParam {
    return {
      kind: 'color',
      ...options,
      sanitize: (raw) =>
        typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw)
          ? raw.toLowerCase()
          : options.default,
    };
  },

  custom<T>(options: Common<T> & { sanitize: (raw: unknown) => T }): CustomParam<T> {
    return { kind: 'custom', ...options };
  },
};

/** The schema's default settings. */
export function defaults<S extends Schema>(schema: S): Values<S> {
  return Object.fromEntries(
    Object.entries(schema).map(([key, param]) => [key, structuredClone(param.default)]),
  ) as Values<S>;
}

/**
 * A complete, valid settings object from untrusted input: unknown keys are
 * dropped, missing or invalid ones fall back to their defaults, and numbers
 * are clamped.
 */
export function sanitize<S extends Schema>(schema: S, raw: unknown): Values<S> {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(schema).map(([key, param]) => [key, param.sanitize(source[key])]),
  ) as Values<S>;
}

/** Resolve a static or settings-dependent label. */
export function resolveLabel(
  label: string | ((values: AnyValues) => string),
  values: AnyValues,
): string {
  return typeof label === 'function' ? label(values) : label;
}
