<!--
  The form generated from a settings schema: one field per visible setting
  (sliders, number boxes, segmented choices or drop-downs, checkboxes, color
  pickers). Custom settings (e.g. the crop box) have their own editors.
-->
<script lang="ts">
  import {
    resolveLabel,
    type AnyValues,
    type Param,
    type ParamContext,
    type Schema,
  } from '../core/params';

  let {
    schema,
    values,
    context = { hasSteps: true },
    onchange,
    idPrefix,
  }: {
    schema: Schema;
    values: AnyValues;
    context?: ParamContext;
    onchange: (key: string, value: unknown) => void;
    /** Makes input ids unique when several forms are on the page. */
    idPrefix: string;
  } = $props();

  const visible = $derived(
    Object.entries(schema).filter(
      ([, param]) => param.kind !== 'custom' && (!param.when || param.when(values, context)),
    ),
  );

  function unitOf(param: Param): string {
    if (param.kind !== 'number' || !param.unit) return '';
    return typeof param.unit === 'function' ? param.unit(values) : param.unit;
  }

  function setNumber(key: string, param: Param, raw: string): void {
    const value = Number(raw);
    if (raw === '' || Number.isNaN(value)) return;
    onchange(key, param.sanitize(value));
  }
</script>

<div class="fields">
  {#each visible as [key, param] (key)}
    {@const id = `${idPrefix}-${key}`}
    {@const label = resolveLabel(param.label, values)}
    {#if param.kind === 'number'}
      <div class="field">
        {#if param.slider}
          <label class="field-label" for={id}>
            {label}
            <span class="field-value">{values[key]}{unitOf(param)}</span>
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
          <label class="field-label" for={id}>{label}</label>
          <div class="row">
            <input
              {id}
              type="number"
              inputmode="decimal"
              min={param.min}
              max={param.max}
              step={param.step}
              value={values[key]}
              onchange={(event) => setNumber(key, param, event.currentTarget.value)}
            />
            <span class="muted">{unitOf(param)}</span>
          </div>
        {/if}
        {#if param.hint}<span class="hint">{param.hint}</span>{/if}
      </div>
    {:else if param.kind === 'choice'}
      {@const options = param.options.filter((option) => !option.when || option.when(context))}
      <div class="field">
        {#if param.display === 'select'}
          <label class="field-label" for={id}>{label}</label>
          <select
            {id}
            value={values[key]}
            onchange={(event) => onchange(key, param.sanitize(event.currentTarget.value))}
          >
            {#each options as option (option.value)}
              <option value={option.value}>{resolveLabel(option.label, values)}</option>
            {/each}
          </select>
        {:else}
          <span class="field-label" {id}>{label}</span>
          <div class="segmented" role="group" aria-labelledby={id}>
            {#each options as option (option.value)}
              <button
                type="button"
                aria-pressed={values[key] === option.value}
                onclick={() => onchange(key, option.value)}
              >
                {resolveLabel(option.label, values)}
              </button>
            {/each}
          </div>
        {/if}
        {#if param.hint}<span class="hint">{param.hint}</span>{/if}
      </div>
    {:else if param.kind === 'boolean'}
      <label class="check">
        <input
          type="checkbox"
          checked={Boolean(values[key])}
          onchange={(event) => onchange(key, event.currentTarget.checked)}
        />
        {label}
      </label>
    {:else if param.kind === 'color'}
      <div class="field">
        <label class="field-label" for={id}>{label}</label>
        <div class="row">
          <input
            {id}
            type="color"
            value={values[key]}
            oninput={(event) => onchange(key, param.sanitize(event.currentTarget.value))}
          />
          <input
            class="mono"
            aria-label="{label} (hex)"
            value={values[key]}
            onchange={(event) => onchange(key, param.sanitize(event.currentTarget.value))}
          />
        </div>
        {#if param.hint}<span class="hint">{param.hint}</span>{/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .mono {
    font-family: ui-monospace, monospace;
    max-width: 8rem;
  }
</style>
