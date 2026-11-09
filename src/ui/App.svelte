<!--
  The app: the home screen (images in, pick a tool) or the open tool.
  Images can be dropped or pasted on either.
-->
<script lang="ts">
  import { session } from "../app/session.svelte";
  import DropOverlay from "./DropOverlay.svelte";
  import Home from "./Home.svelte";
  import ToolScreen from "./ToolScreen.svelte";

  // Each screen starts at the top.
  $effect(() => {
    void session.op;
    scrollTo(0, 0);
  });
</script>

<svelte:window
  onkeydown={(event) => {
    // Escape goes back to the tools, unless it's closing something in a field.
    if (event.key !== "Escape" || !session.tool) return;
    if ((event.target as HTMLElement).matches("input, textarea, select"))
      return;
    session.closeTool();
  }}
/>

{#if session.op}
  <ToolScreen op={session.op} />
{:else}
  <Home />
{/if}

<DropOverlay />
