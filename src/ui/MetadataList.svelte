<!--
  For Strip metadata: what each image carries that will be removed (camera,
  lens, date, location, author…), and what stays, so the image looks the same.
-->
<script lang="ts">
  import ShieldCheck from "@lucide/svelte/icons/shield-check";

  import { session } from "../app/session.svelte";

  /** `Camera: Apple iPhone 15` → label and value; `XMP (…)` → a label alone. */
  function split(entry: string): [string, string] {
    const at = entry.indexOf(": ");
    return at < 0 ? [entry, ""] : [entry.slice(0, at), entry.slice(at + 2)];
  }

  const carrying = $derived(
    session.items.filter((item) => item.version.metadata.length).length,
  );
</script>

<section class="removed" aria-labelledby="removed-title">
  <h3 id="removed-title">What's removed</h3>
  {#if session.items.length > 1}
    <p class="hint">
      {carrying === 0
        ? "None of the images carries any."
        : `${carrying} of ${session.items.length} images carry some.`}
    </p>
  {/if}
  <ul>
    {#each session.items as item (item.id)}
      {@const entries = item.version.metadata.map(split)}
      <li class:picked={item === session.selected}>
        <span class="name">{item.version.name}</span>
        {#if entries.length}
          <dl>
            {#each entries as [label, value] (label)}
              {#if value}
                <dt>{label}</dt>
                <dd>{value}</dd>
              {:else}
                <dt class="whole">{label}</dt>
              {/if}
            {/each}
          </dl>
        {:else}
          <p class="hint">Nothing to remove.</p>
        {/if}
      </li>
    {/each}
  </ul>
  <p class="kept hint">
    <ShieldCheck size={16} /> Kept: the orientation and the color profile, so the
    image looks the same.
  </p>
</section>

<style>
  .removed {
    display: grid;
    gap: 0.6rem;
  }

  h3 {
    font-size: var(--text-body);
  }

  ul {
    display: grid;
    gap: 0.5rem;
    list-style: none;
    margin: 0;
    max-height: 22rem;
    overflow-y: auto;
    padding: 0;
  }

  li {
    background: var(--fill);
    border: 1.5px solid transparent;
    border-radius: var(--radius);
    display: grid;
    gap: 0.35rem;
    padding: 0.6rem 0.75rem;
  }

  /* The image in the preview. */
  li.picked {
    border-color: var(--accent);
  }

  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  dl {
    display: grid;
    gap: 0.2rem 0.75rem;
    grid-template-columns: auto minmax(0, 1fr);
    margin: 0;
  }

  dt {
    color: var(--muted);
  }

  dt.whole {
    grid-column: 1 / -1;
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .kept {
    align-items: center;
    display: flex;
    gap: 0.4rem;
  }
</style>
