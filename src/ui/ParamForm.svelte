<!--
  The form generated from a settings schema: one field per visible setting
  (sliders, number boxes, segmented choices or drop-downs, checkboxes,
  colors). Custom settings (the crop box) have their own editors. A color
  can also be picked from the image, when the form is given `onpick`.
-->
<script lang="ts">
  import Pipette from "@lucide/svelte/icons/pipette";
  import type { Snippet } from "svelte";

  import {
    textOf,
    type AnyValues,
    type NumberParam,
    type Schema,
  } from "../core/params";
  import { ICONS } from "./icons";

  let {
    schema,
    values,
    onchange,
    idPrefix,
    picking = null,
    onpick,
    colorActions,
  }: {
    schema: Schema;
    values: AnyValues;
    onchange: (key: string, value: unknown) => void;
    /** The color setting being picked from the image. */
    picking?: string | null;
    /** Start (or stop, for the one being picked) picking a color from the image. */
    onpick?: (key: string) => void;
    /** More buttons by a color field (e.g. Detect), given its key. */
    colorActions?: Snippet<[string]>;
    /** Makes input ids unique when several forms are on the page. */
    idPrefix: string;
  } = $props();

  const visible = $derived(
    Object.entries(schema).filter(
      ([, param]) =>
        param.kind !== "custom" && (!param.when || param.when(values)),
    ),
  );

  /** Ignore an empty or half-typed box; clamp anything else into range. */
  function setNumber(key: string, param: NumberParam, raw: string): void {
    const value = Number(raw);
    if (raw === "" || !Number.isFinite(value)) return;
    onchange(key, Math.min(param.max, Math.max(param.min, value)));
  }
</script>

<div class="fields">
  {#each visible as [key, param] (key)}
    {@const id = `${idPrefix}-${key}`}
    {#if param.kind === "number"}
      <div class="field">
        {#if param.slider}
          <div class="field-label">
            <label for={id}>{textOf(param.label, values)}</label>
            <!-- The value, also to type in: a slider can't hit 0.1° on a phone. -->
            <span class="field-value">
              <input
                class="exact"
                type="number"
                inputmode="decimal"
                aria-label="{textOf(param.label, values)} value"
                min={param.min}
                max={param.max}
                step={param.step}
                value={values[key]}
                onchange={(event) => {
                  setNumber(key, param, event.currentTarget.value);
                  event.currentTarget.value = String(values[key]);
                }}
              />{param.unit ?? ""}
            </span>
          </div>
          <input
            {id}
            type="range"
            min={param.min}
            max={param.max}
            step={param.step}
            value={values[key]}
            oninput={(event) =>
              setNumber(key, param, event.currentTarget.value)}
          />
        {:else}
          <label class="field-label" for={id}
            >{textOf(param.label, values)}</label
          >
          <div class="row">
            <input
              {id}
              type="number"
              inputmode="decimal"
              min={param.min}
              max={param.max}
              step={param.step}
              value={values[key]}
              onchange={(event) => {
                setNumber(key, param, event.currentTarget.value);
                // Show the value actually kept (clamped, or unchanged when invalid).
                event.currentTarget.value = String(values[key]);
              }}
            />
            <span class="muted">{param.unit ?? ""}</span>
          </div>
        {/if}
        {#if param.hint}<span class="hint">{param.hint}</span>{/if}
      </div>
    {:else if param.kind === "choice"}
      <div class="field">
        {#if param.display === "select"}
          <label class="field-label" for={id}
            >{textOf(param.label, values)}</label
          >
          <select
            {id}
            value={values[key]}
            onchange={(event) => onchange(key, event.currentTarget.value)}
          >
            {#each param.options as option (option.value)}
              <option value={option.value}
                >{textOf(option.label, values)}</option
              >
            {/each}
          </select>
        {:else}
          <span class="field-label" {id}>{textOf(param.label, values)}</span>
          <div
            class="segmented"
            class:icons={param.display === "icons"}
            role="group"
            aria-labelledby={id}
          >
            {#each param.options as option (option.value)}
              {@const label = textOf(option.label, values)}
              {@const Icon = option.icon && ICONS[textOf(option.icon, values)]}
              <button
                type="button"
                aria-pressed={values[key] === option.value}
                aria-label={param.display === "icons" ? label : undefined}
                title={param.display === "icons" ? label : undefined}
                onclick={() => onchange(key, option.value)}
              >
                {#if Icon}<Icon size={18} />{/if}
                {#if param.display !== "icons"}{label}{/if}
              </button>
            {/each}
          </div>
        {/if}
        {#if param.hint}<span class="hint">{param.hint}</span>{/if}
      </div>
    {:else if param.kind === "color"}
      <div class="field">
        <label class="field-label" for={id}>{textOf(param.label, values)}</label
        >
        <div class="row">
          <input
            {id}
            type="color"
            value={values[key]}
            oninput={(event) => onchange(key, event.currentTarget.value)}
          />
          <input
            class="hex"
            aria-label="{textOf(param.label, values)} (hex)"
            value={values[key]}
            onchange={(event) => {
              const hex = event.currentTarget.value
                .trim()
                .replace(/^#?/, "#")
                .toLowerCase();
              if (/^#[0-9a-f]{6}$/.test(hex)) onchange(key, hex);
              event.currentTarget.value = String(values[key]);
            }}
          />
          {#if onpick}
            <button
              class="icon pick"
              type="button"
              aria-label="Pick {textOf(
                param.label,
                values,
              ).toLowerCase()} from the image"
              title="Pick from the image"
              aria-pressed={picking === key}
              onclick={() => onpick(key)}><Pipette size={16} /></button
            >
          {/if}
          {@render colorActions?.(key)}
        </div>
        {#if param.hint}<span class="hint">{param.hint}</span>{/if}
      </div>
    {:else if param.kind === "boolean"}
      <label class="check">
        <input
          type="checkbox"
          checked={Boolean(values[key])}
          onchange={(event) => onchange(key, event.currentTarget.checked)}
        />
        {textOf(param.label, values)}
      </label>
    {/if}
  {/each}
</div>

<style>
  /* The slider's value, quiet until it's edited. */
  .exact {
    background: transparent;
    border-color: transparent;
    min-height: 0;
    padding: 0 0.15rem;
    margin-right: 0.1rem;
    text-align: right;
    width: 4rem;
  }

  .exact {
    appearance: textfield;
  }

  .exact::-webkit-inner-spin-button {
    appearance: none;
  }

  .exact:hover,
  .exact:focus {
    background: var(--sheet);
    border-color: var(--line);
  }

  .hex {
    font-family: ui-monospace, monospace;
    width: 7rem;
  }

  .pick[aria-pressed="true"] {
    background: var(--accent-soft);
    color: var(--accent);
  }
</style>
