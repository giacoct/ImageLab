/**
 * How each tool looks: its icon (Lucide) and its color. The colors run
 * through the spectrum in the order the tools are listed, red to pink.
 * `color` is deep enough for white text (Apply) and for icons on white;
 * `soft` is a pale tint of it, behind icons.
 */

import type { Component } from 'svelte';

import Combine from '@lucide/svelte/icons/combine';
import Crop from '@lucide/svelte/icons/crop';
import Eraser from '@lucide/svelte/icons/eraser';
import Frame from '@lucide/svelte/icons/frame';
import MapPinOff from '@lucide/svelte/icons/map-pin-off';
import PenTool from '@lucide/svelte/icons/pen-tool';
import Replace from '@lucide/svelte/icons/replace';
import Scaling from '@lucide/svelte/icons/scaling';
import ScanText from '@lucide/svelte/icons/scan-text';
import Shrink from '@lucide/svelte/icons/shrink';
import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';

export interface ToolLook {
  icon: Component<{ size?: number }>;
  color: string;
  soft: string;
}

export const TOOL_LOOKS: Record<string, ToolLook> = {
  transform: { icon: Crop, color: '#c92a2a', soft: '#ffe3e3' },
  scale: { icon: Scaling, color: '#d9480f', soft: '#ffe8cc' },
  adjust: { icon: SlidersHorizontal, color: '#b25e00', soft: '#fff3bf' },
  'remove-background': { icon: Eraser, color: '#2b8a3e', soft: '#d3f9d8' },
  margin: { icon: Frame, color: '#087f5b', soft: '#c3fae8' },
  merge: { icon: Combine, color: '#0b7285', soft: '#c5f6fa' },
  convert: { icon: Replace, color: '#1971c2', soft: '#d0ebff' },
  compress: { icon: Shrink, color: '#3b5bdb', soft: '#dbe4ff' },
  'strip-metadata': { icon: MapPinOff, color: '#6741d9', soft: '#e5dbff' },
  vectorize: { icon: PenTool, color: '#9c36b5', soft: '#f3d9fa' },
  ocr: { icon: ScanText, color: '#c2255c', soft: '#ffdeeb' },
};
