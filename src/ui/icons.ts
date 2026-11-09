/**
 * The icons settings can name (`ChoiceOption.icon` in core/params.ts): the
 * core stays free of components, and only these are bundled.
 */

import type { Component } from "svelte";

import AlignCenterHorizontal from "@lucide/svelte/icons/align-center-horizontal";
import AlignCenterVertical from "@lucide/svelte/icons/align-center-vertical";
import AlignEndHorizontal from "@lucide/svelte/icons/align-end-horizontal";
import AlignEndVertical from "@lucide/svelte/icons/align-end-vertical";
import AlignStartHorizontal from "@lucide/svelte/icons/align-start-horizontal";
import AlignStartVertical from "@lucide/svelte/icons/align-start-vertical";
import RectangleHorizontal from "@lucide/svelte/icons/rectangle-horizontal";
import RectangleVertical from "@lucide/svelte/icons/rectangle-vertical";

export const ICONS: Record<string, Component<{ size?: number }>> = {
  "align-center-horizontal": AlignCenterHorizontal,
  "align-center-vertical": AlignCenterVertical,
  "align-end-horizontal": AlignEndHorizontal,
  "align-end-vertical": AlignEndVertical,
  "align-start-horizontal": AlignStartHorizontal,
  "align-start-vertical": AlignStartVertical,
  "rectangle-horizontal": RectangleHorizontal,
  "rectangle-vertical": RectangleVertical,
};
