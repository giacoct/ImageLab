<!--
  The app: the home page (images in, pick a tool) or a tool's page.
-->
<script lang="ts">
  import { goHome } from "../app/router";
  import { session } from "../app/session.svelte";
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
    goHome();
  }}
  ondragover={(event) => {
    // Images come in only on the home page. Elsewhere a dropped file would
    // make the browser open it in place of the app.
    if (!session.tool || !event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "none";
  }}
  ondrop={(event) => {
    if (session.tool) event.preventDefault();
  }}
/>

{#if session.op}
  <ToolScreen op={session.op} />
{:else}
  <Home />
{/if}
