<!--
  A tool's illustration as a before/after comparison, the way image editors
  compare versions: "before" on the left of a divider, "after" on the right.
  When the card around it is hovered or focused (`.compare-host`), the divider
  sweeps left to show the result.
-->
<script lang="ts">
  import ToolArt from './ToolArt.svelte';

  let {
    icon,
    split = 50,
    demo = false,
    wide = false,
  }: {
    icon: string;
    split?: number;
    /** Use the illustration's wider view (for wide cards). */
    wide?: boolean;
    /** Sweep the divider back and forth on its own, to show the comparison off. */
    demo?: boolean;
  } = $props();
</script>

<div class="compare" class:demo style:--split="{split}%">
  <ToolArt {icon} {wide} state="before" />
  <div class="after"><ToolArt {icon} {wide} state="after" /></div>
  <span class="divider" aria-hidden="true"><span class="knob"></span></span>
</div>

<style>
  .compare {
    height: 100%;
    overflow: hidden;
    position: relative;
    width: 100%;
  }

  .after {
    clip-path: inset(0 0 0 var(--split));
    inset: 0;
    position: absolute;
    transition: clip-path 700ms var(--ease);
  }

  .divider {
    background: #ffffff;
    bottom: 0;
    box-shadow: 0 0 0 0.5px rgb(0 0 0 / 0.12);
    left: var(--split);
    position: absolute;
    top: 0;
    transition: left 700ms var(--ease);
    width: 2px;
  }

  /* The handle: a small white knob with two notches, as on a compare slider. */
  .knob {
    background:
      linear-gradient(#9a9aa6, #9a9aa6) 9px 50% / 1.5px 8px no-repeat,
      linear-gradient(#9a9aa6, #9a9aa6) 13px 50% / 1.5px 8px no-repeat,
      #ffffff;
    border-radius: 999px;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
    height: 24px;
    left: -11px;
    position: absolute;
    top: calc(50% - 12px);
    width: 24px;
  }

  .demo .after {
    animation: sweep-after 7s var(--ease) 0.8s infinite;
  }

  .demo .divider {
    animation: sweep-divider 7s var(--ease) 0.8s infinite;
  }

  @keyframes sweep-after {
    0%,
    12%,
    88%,
    100% {
      clip-path: inset(0 0 0 var(--split));
    }
    40%,
    60% {
      clip-path: inset(0 0 0 8%);
    }
  }

  @keyframes sweep-divider {
    0%,
    12%,
    88%,
    100% {
      left: var(--split);
    }
    40%,
    60% {
      left: 8%;
    }
  }

  :global(.compare-host:hover) .after,
  :global(.compare-host:focus-visible) .after {
    clip-path: inset(0 0 0 10%);
  }

  :global(.compare-host:hover) .divider,
  :global(.compare-host:focus-visible) .divider {
    left: 10%;
  }
</style>
