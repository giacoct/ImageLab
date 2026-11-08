<!--
  The form generated from a settings schema: one field per visible setting
  (sliders, number boxes, segmented choices or drop-downs, checkboxes,
  colors). Custom settings (the crop box) have their own editors.
-->
<script lang="ts">
  import type { AnyValues, NumberParam, Schema } from '../core/params';

  let {
    schema,
    values,
    onchange,
    idPrefix,
  }: {
    schema: Schema;
    values: AnyValues;
    onchange: (key: string, value: unknown) => void;
    /** Makes input ids unique when several forms are on the page. */
    idPrefix: string;
  } = $props();

  const visible = $derived(
    Object.entries(schema).filter(
      ([, param]) => param.kind !== 'custom' && (!param.when || param.when(values)),
    ),
  );

  /** Ignore an empty or half-typed box; clamp anything else into range. */
  function setNumber(key: string, param: NumberParam, raw: string): void {
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value)) return;
    onchange(key, Math.min(param.max, Math.max(param.min, value)));
  }
</script>

<div class="fields">
  {#each visible as [key, param] (key)}
    {@const id = `${idPrefix}-${key}`}
    {#if param.kind === 'number'}
      <div class="field">
        {#if param.slider}
          <label class="field-label" for={id}>
            {param.label}
            <span class="field-value">{values[key]}{param.unit ?? ''}</span>
          </label>
          <input
            {id}
            type="range"
            min={param.min}
            max={param.max}
            step={param.step}
            value={values[key]}
            oninput={(event) => setNumber(key, param, event.currentTarget.value)}
          />
        {:else}
          <label class="field-label" for={id}>{param.label}</label>
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
            <span class="muted">{param.unit ?? ''}</span>
          </div>
        {/if}
        {#if param.hint}<span class="hint">{param.hint}</span>{/if}
      </div>
    {:else if param.kind === 'choice'}
      <div class="field">
        {#if param.display === 'select'}
          <label class="field-label" for={id}>{param.label}</label>
          <select
            {id}
            value={values[key]}
            onchange={(event) => onchange(key, event.currentTarget.value)}
          >
            {#each param.options as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {:else}
          <span class="field-label" {id}>{param.label}</span>
          <div class="segmented" role="group" aria-labelledby={id}>
            {#each param.options as option (option.value)}
              <button
                type="button"
                aria-pressed={values[key] === option.value}
                onclick={() => onchange(key, option.value)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        {/if}
        {#if param.hint}<span class="hint">{param.hint}</span>{/if}
      </div>
    {:else if param.kind === 'color'}
      <div class="field">
        <label class="field-label" for={id}>{param.label}</label>
        <div class="row">
          <input
            {id}
            type="color"
            value={values[key]}
            oninput={(event) => onchange(key, event.currentTarget.value)}
          />
          <input
            class="hex"
            aria-label="{param.label} (hex)"
            value={values[key]}
            onchange={(event) => {
              const hex = event.currentTarget.value.trim().replace(/^#?/, '#').toLowerCase();
              if (/^#[0-9a-f]{6}$/.test(hex)) onchange(key, hex);
              event.currentTarget.value = String(values[key]);
            }}
          />
        </div>
        {#if param.hint}<span class="hint">{param.hint}</span>{/if}
      </div>
    {:else if param.kind === 'boolean'}
      <label class="check">
        <input
          type="checkbox"
          checked={Boolean(values[key])}
          onchange={(event) => onchange(key, event.currentTarget.checked)}
        />
        {param.label}
      </label>
    {/if}
  {/each}
</div>

<style>
  .hex {
    font-family: ui-monospace, monospace;
    width: 7rem;
  }
</style>
