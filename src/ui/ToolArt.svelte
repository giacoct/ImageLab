<!--
  The illustration of a tool: one shared scene (a hot-air balloon over hills)
  shown as it is ("before") or as the tool leaves it ("after"): background
  removed, traced to vectors, upscaled, cropped, and so on. Cards layer the
  two with a comparison divider (ui/Compare.svelte). Keyed by the tool's or
  operation's icon. The colors are the illustration's own, the same in both
  themes, like a photo would be.
-->
<script lang="ts" module>
  /** Icons that have an illustration (every tool's and every operation's). */
  export const ART = new Set([
    'resize',
    'crop',
    'scale',
    'convert',
    'compress',
    'strip',
    'scissors',
    'adjust',
    'margin',
    'merge',
    'upscale',
    'vector',
    'ocr',
  ]);

  const ACCENT = '#3d3df5';
  const INK = '#18181b';
</script>

<script lang="ts">
  let {
    icon,
    state = 'after',
    wide = false,
  }: {
    icon: string;
    state?: 'before' | 'after';
    /** A wider view of the same scene, for wide cards (instead of a cropped zoom). */
    wide?: boolean;
  } = $props();

  // Ids must be unique on the page: the same art appears in several places.
  const uid = $props.id();
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  const after = $derived(state === 'after');
  // The visible part of the scene: its left edge, width and right edge.
  const X0 = $derived(wide ? -160 : 0);
  const W = $derived(wide ? 720 : 400);
  const R = $derived(X0 + W);
  /** Each half of the merged picture, cropped around the balloon. */
  const HALF = $derived(W / 2 - 3);
  const kind = $derived(icon === 'crop' ? 'resize' : icon);

  // Balloon anchor points, for the vector tracing's handles.
  const NODES: [number, number][] = [
    [180, 42],
    [230, 96],
    [194, 156],
    [166, 156],
    [130, 96],
  ];
</script>

{#snippet chip(x: number, y: number, text: string, accent = false, alignRight = false)}
  {@const width = text.length * 6.9 + 20}
  {@const left = alignRight ? x - width : x}
  <g class="chip">
    <rect
      x={left}
      {y}
      {width}
      height="22"
      rx="11"
      fill={accent ? ACCENT : '#ffffff'}
      fill-opacity={accent ? 1 : 0.94}
    />
    <text
      x={left + width / 2}
      y={y + 15}
      text-anchor="middle"
      font-size="11.5"
      font-weight="650"
      fill={accent ? '#ffffff' : INK}>{text}</text
    >
  </g>
{/snippet}

{#snippet balloon(wire = false)}
  <g class="balloon">
    <line
      x1="168"
      y1="156"
      x2="172"
      y2="177"
      stroke={wire ? ACCENT : '#6b4a33'}
      stroke-width="1.6"
    />
    <line
      x1="192"
      y1="156"
      x2="188"
      y2="177"
      stroke={wire ? ACCENT : '#6b4a33'}
      stroke-width="1.6"
    />
    {#if wire}
      <path
        d="M180 42C214 42 230 70 230 96C230 124 206 142 194 156H166C154 142 130 124 130 96C130 70 146 42 180 42Z"
        fill="none"
        stroke={ACCENT}
        stroke-width="1.8"
      />
      <path
        d="M180 42C196 60 200 120 194 156M180 42C164 60 160 120 166 156"
        fill="none"
        stroke={ACCENT}
        stroke-width="1.2"
      />
      <rect
        x="170"
        y="177"
        width="20"
        height="14"
        rx="3"
        fill="none"
        stroke={ACCENT}
        stroke-width="1.6"
      />
    {:else}
      <g clip-path={url('envelope')}>
        <rect x="128" y="40" width="104" height="120" fill="#fff4e0" />
        <rect x="128" y="40" width="22" height="120" fill={ACCENT} />
        <rect x="160" y="40" width="10" height="120" fill="#ff6b4a" />
        <rect x="190" y="40" width="10" height="120" fill="#ff6b4a" />
        <rect x="210" y="40" width="22" height="120" fill={ACCENT} />
        <ellipse cx="160" cy="80" rx="14" ry="26" fill="#ffffff" opacity="0.28" />
        <path d="M232 40V160H200C222 130 226 80 206 40Z" fill="#000000" opacity="0.1" />
      </g>
      <rect x="170" y="177" width="20" height="14" rx="3" fill="#9a6b47" />
      <rect x="168" y="175" width="24" height="4" rx="2" fill="#6b4a33" />
    {/if}
  </g>
{/snippet}

{#snippet scene(options: { wire?: boolean; banner?: boolean; filter?: string })}
  {@const wire = options.wire ?? false}
  <g filter={options.filter}>
    {#if wire}
      <rect x="-200" y="-200" width="800" height="650" fill="#fbfbff" />
      <path d="M-200 0H600M-200 50H600M-200 100H600M-200 150H600M-200 200H600" stroke="#e4e4f4" />
      <path
        d="M0 -200V450M50 -200V450M100 -200V450M150 -200V450M200 -200V450M250 -200V450M300 -200V450M350 -200V450M400 -200V450"
        stroke="#e4e4f4"
      />
    {:else}
      <rect x="-200" y="-200" width="800" height="650" fill={url('sky')} />
    {/if}
    <circle
      cx="318"
      cy="78"
      r="26"
      fill={wire ? 'none' : '#ffc93c'}
      stroke={wire ? ACCENT : 'none'}
      stroke-width="1.8"
    />
    {#if !wire}
      <g fill="#ffffff" opacity="0.92">
        <ellipse cx="66" cy="62" rx="30" ry="11" />
        <ellipse cx="84" cy="54" rx="18" ry="11" />
        <ellipse cx="262" cy="36" rx="24" ry="8" />
        <ellipse cx="276" cy="30" rx="13" ry="8" />
      </g>
    {/if}
    <path
      d="M-200 170C-100 150 0 140 60 148S180 172 240 160S340 138 400 150S520 160 600 150V450H-200Z"
      fill={wire ? 'none' : '#9fe3c6'}
      stroke={wire ? ACCENT : 'none'}
      stroke-width="1.6"
    />
    <path
      d="M-200 205C-80 190 0 175 80 188S200 205 260 196S360 180 400 186S520 200 600 192V450H-200Z"
      fill={wire ? 'none' : '#3fbf93'}
      stroke={wire ? ACCENT : 'none'}
      stroke-width="1.6"
    />
    <path
      d="M-200 238C-60 226 60 216 150 226S300 238 400 222S520 214 600 220V450H-200Z"
      fill={wire ? 'none' : '#24896b'}
      stroke={wire ? ACCENT : 'none'}
      stroke-width="1.6"
    />
    {@render balloon(wire)}
    {#if options.banner}
      <line x1="180" y1="191" x2="180" y2="203" stroke="#6b4a33" stroke-width="1.6" />
      <rect x="122" y="203" width="116" height="30" rx="5" fill="#fff4e0" stroke="#e6d3b3" />
      <text
        x="180"
        y="224"
        text-anchor="middle"
        font-size="17"
        font-weight="800"
        letter-spacing="1"
        fill={INK}>HELLO!</text
      >
    {/if}
    {#if wire}
      {#each NODES as [x, y] (`${x}-${y}`)}
        <rect
          x={x - 3.5}
          y={y - 3.5}
          width="7"
          height="7"
          fill="#ffffff"
          stroke={ACCENT}
          stroke-width="1.5"
        />
      {/each}
      <line x1="230" y1="96" x2="230" y2="66" stroke={ACCENT} stroke-width="1" />
      <circle cx="230" cy="66" r="3" fill={ACCENT} />
      <line x1="230" y1="96" x2="230" y2="126" stroke={ACCENT} stroke-width="1" />
      <circle cx="230" cy="126" r="3" fill={ACCENT} />
    {/if}
  </g>
{/snippet}

<svg viewBox="{X0} 0 {W} 250" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bfe0ff" />
      <stop offset="0.75" stop-color="#ffe6d2" />
    </linearGradient>
    <clipPath id={id('envelope')}>
      <path
        d="M180 42C214 42 230 70 230 96C230 124 206 142 194 156H166C154 142 130 124 130 96C130 70 146 42 180 42Z"
      />
    </clipPath>
    <pattern id={id('checker')} width="20" height="20" patternUnits="userSpaceOnUse">
      <rect width="20" height="20" fill="#ffffff" />
      <rect width="10" height="10" fill="#e8e8ee" />
      <rect x="10" y="10" width="10" height="10" fill="#e8e8ee" />
    </pattern>
    <pattern id={id('pixels')} width="9" height="9" patternUnits="userSpaceOnUse">
      <path d="M9 0H0V9" fill="none" stroke="#ffffff" stroke-opacity="0.35" />
    </pattern>
    <filter id={id('blur')} x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="2.6" />
    </filter>
    <filter id={id('mono')}>
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncR type="linear" slope="1.2" intercept="-0.08" />
        <feFuncG type="linear" slope="1.2" intercept="-0.08" />
        <feFuncB type="linear" slope="1.2" intercept="-0.08" />
      </feComponentTransfer>
    </filter>
    <filter id={id('dusk')}>
      <!-- Golden hour: the same scene, warmer and lower in the sky. -->
      <feColorMatrix
        type="matrix"
        values="1.1 0.15 0 0 0.04  0.06 0.82 0.08 0 0.02  0 0.12 0.62 0 0.04  0 0 0 1 0"
      />
    </filter>
  </defs>

  {#if !after}
    {#if kind === 'upscale'}
      {@render scene({ filter: url('blur') })}
      <rect x={X0} width={W} height="250" fill={url('pixels')} />
      {@render chip(X0 + 14, 14, '1×')}
    {:else if kind === 'vector'}
      {@render scene({})}
      {@render chip(X0 + 14, 14, 'PNG')}
    {:else if kind === 'ocr'}
      {@render scene({ banner: true })}
    {:else}
      {@render scene({})}
      {#if kind === 'convert'}
        {@render chip(X0 + 14, 14, 'PNG')}
      {:else if kind === 'compress'}
        {@render chip(X0 + 14, 14, '2.4 MB')}
      {:else if kind === 'strip'}
        {@render chip(X0 + 14, 14, 'f/1.8  ISO 100')}
        {@render chip(X0 + 14, 42, '12 Aug 2025')}
        <g transform="translate({X0 + 40} 150)">
          <path
            d="M0 0C-8 0-13 6-13 12C-13 21 0 32 0 32S13 21 13 12C13 6 8 0 0 0Z"
            fill="#ff6b4a"
          />
          <circle cx="0" cy="12" r="4.5" fill="#ffffff" />
        </g>
        {@render chip(X0 + 58, 160, 'Lake Como')}
      {/if}
    {/if}
  {:else if kind === 'resize'}
    <g transform="translate(180 110) rotate(-7) scale(1.55) translate(-180 -110)">
      {@render scene({})}
    </g>
    <g stroke="#ffffff" stroke-opacity="0.75">
      <line x1={X0 + W / 3} y1="0" x2={X0 + W / 3} y2="250" />
      <line x1={X0 + (2 * W) / 3} y1="0" x2={X0 + (2 * W) / 3} y2="250" />
      <line x1={X0} y1="83" x2={R} y2="83" />
      <line x1={X0} y1="167" x2={R} y2="167" />
    </g>
    <path
      d="M{X0 + 18} 46V18H{X0 + 46}M{R - 46} 18H{R - 18}V46M{R - 18} 204V232H{R - 46}M{X0 +
        46} 232H{X0 + 18}V204"
      fill="none"
      stroke="#ffffff"
      stroke-width="5"
      stroke-linecap="round"
    />
  {:else if kind === 'scale'}
    <rect x={X0} width={W} height="250" fill="#ececf2" />
    <rect
      x={X0 + 16}
      y="14"
      width={W - 32}
      height="222"
      rx="6"
      fill="none"
      stroke="#b9b9c8"
      stroke-dasharray="6 5"
      stroke-width="1.5"
    />
    <svg
      x={X0 + W / 2 - 92}
      y="66"
      width="184"
      height="118"
      viewBox="0 0 400 250"
      preserveAspectRatio="xMidYMid slice"
    >
      {@render scene({})}
    </svg>
    <rect
      x={X0 + W / 2 - 92}
      y="66"
      width="184"
      height="118"
      fill="none"
      stroke="#ffffff"
      stroke-width="2"
    />
    {@render chip(R - 14, 26, '50%', true, true)}
  {:else if kind === 'convert'}
    {@render scene({})}
    {@render chip(R - 14, 14, 'WEBP', true, true)}
  {:else if kind === 'compress'}
    {@render scene({})}
    {@render chip(R - 14, 14, '312 KB', true, true)}
  {:else if kind === 'strip'}
    {@render scene({})}
    {@render chip(R - 14, 14, 'No metadata', true, true)}
  {:else if kind === 'scissors'}
    <rect x="-200" y="-200" width="800" height="650" fill={url('checker')} />
    <ellipse cx="180" cy="200" rx="34" ry="5" fill="#000000" opacity="0.08" />
    {@render balloon()}
  {:else if kind === 'adjust'}
    {@render scene({ filter: url('mono') })}
  {:else if kind === 'margin'}
    <rect x={X0} width={W} height="250" fill="#fff1dc" />
    <svg
      x={X0 + 34}
      y="28"
      width={W - 68}
      height="194"
      viewBox="{X0} 0 {W} 250"
      preserveAspectRatio="xMidYMid slice"
    >
      {@render scene({})}
    </svg>
  {:else if kind === 'merge'}
    <rect x={X0} width={W} height="250" fill="#ffffff" />
    <svg
      x={X0}
      y="0"
      width={HALF}
      height="250"
      viewBox="{180 - HALF / 2} 0 {HALF} 250"
      preserveAspectRatio="xMidYMid slice"
    >
      {@render scene({})}
    </svg>
    <svg
      x={R - HALF}
      y="0"
      width={HALF}
      height="250"
      viewBox="{180 - HALF / 2} 0 {HALF} 250"
      preserveAspectRatio="xMidYMid slice"
    >
      {@render scene({ filter: url('dusk') })}
    </svg>
  {:else if kind === 'upscale'}
    {@render scene({})}
    {@render chip(R - 14, 14, '4×', true, true)}
  {:else if kind === 'vector'}
    {@render scene({ wire: true })}
    {@render chip(R - 14, 14, 'SVG', true, true)}
  {:else if kind === 'ocr'}
    {@render scene({ banner: true })}
    <rect x="128" y="207" width="104" height="22" rx="3" fill={ACCENT} opacity="0.32" />
    <path d="M236 204V232M232 204H240M232 232H240" stroke={INK} stroke-width="1.6" />
    {@render chip(R - 14, 14, 'Text found', true, true)}
  {:else}
    {@render scene({})}
  {/if}
</svg>

<style>
  svg {
    display: block;
    font-family: var(--font-display);
    height: 100%;
    width: 100%;
  }
</style>
