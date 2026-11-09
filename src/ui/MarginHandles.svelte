<!--
  Handles on the edges of the "Add margin" preview, laid over it by the
  viewer: dragging one outward widens that side's margin (every side's, when
  they're the same), in the tool's unit. The viewer holds the zoom and the
  image still while one is dragged (`onhold`), so the edge follows the finger.
-->
<script module lang="ts">
  export type Side = "top" | "right" | "bottom" | "left";
</script>

<script lang="ts">
  import { session } from "../app/session.svelte";

  let {
    scale,
    onhold,
  }: {
    /** CSS px per full-size image pixel. */
    scale: number;
    /** A handle was grabbed (its side) or let go (null). */
    onhold: (side: Side | null) => void;
  } = $props();

  const SIDES: Side[] = ["top", "right", "bottom", "left"];
  /** The margin settings' range (ops/margin.ts). */
  const MAX = 5000;

  let drag: {
    side: Side;
    key: string;
    x: number;
    y: number;
    start: number;
    scale: number;
    /** The shorter side of the image, for a margin in percent. */
    base: number | null;
  } | null = null;

  function start(event: PointerEvent, side: Side): void {
    const params = session.tool?.params;
    const item = session.selected;
    if (!params || !item || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation(); // not a pan of the viewer
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const key = params.same ? "size" : side;
    drag = {
      side,
      key,
      x: event.clientX,
      y: event.clientY,
      start: Number(params[key]),
      scale,
      base:
        params.unit === "percent"
          ? Math.min(item.version.width, item.version.height)
          : null,
    };
    onhold(side);
  }

  function move(event: PointerEvent): void {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const outward = { top: -dy, right: dx, bottom: dy, left: -dx }[drag.side];
    const pixels = outward / drag.scale;
    const value = Math.max(
      0,
      Math.min(
        MAX,
        drag.start + (drag.base ? (pixels / drag.base) * 100 : pixels),
      ),
    );
    // Whole pixels, or tenths of a percent.
    const rounded = drag.base ? Math.round(value * 10) / 10 : Math.round(value);
    session.setParam(drag.key, rounded);
  }

  function end(): void {
    if (!drag) return;
    drag = null;
    onhold(null);
  }
</script>

{#each SIDES as side (side)}
  <span
    class="grip {side}"
    role="presentation"
    onpointerdown={(event) => start(event, side)}
    onpointermove={move}
    onpointerup={end}
    onpointercancel={end}
  ></span>
{/each}

<style>
  /* The grip: invisible, larger than the bar it shows, centered on the edge. */
  .grip {
    --grip: 44px;
    --bar: 28px;
    pointer-events: auto;
    position: absolute;
    touch-action: none;
  }

  .grip::after {
    background: #fff;
    border: 2px solid var(--accent);
    border-radius: 999px;
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.35);
    content: "";
    left: 50%;
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
  }

  @media (pointer: coarse) {
    .grip {
      --grip: 56px;
      --bar: 36px;
    }
  }

  .top,
  .bottom {
    cursor: ns-resize;
    height: var(--grip);
    left: calc(50% - var(--grip));
    width: calc(var(--grip) * 2);
  }
  .left,
  .right {
    cursor: ew-resize;
    height: calc(var(--grip) * 2);
    top: calc(50% - var(--grip));
    width: var(--grip);
  }
  .top {
    top: calc(var(--grip) / -2);
  }
  .bottom {
    bottom: calc(var(--grip) / -2);
  }
  .left {
    left: calc(var(--grip) / -2);
  }
  .right {
    right: calc(var(--grip) / -2);
  }
  .top::after,
  .bottom::after {
    height: calc(var(--bar) / 3);
    width: var(--bar);
  }
  .left::after,
  .right::after {
    height: var(--bar);
    width: calc(var(--bar) / 3);
  }
</style>
