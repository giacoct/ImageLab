/**
 * Every tool is a page: `#/<tool id>` (a hash, so it works on any static
 * host, GitHub Pages included); the home page has none. Tools are opened by
 * plain links, so the browser's Back returns to the home page, and so does
 * "Tools": by going back when the tool was opened from home, or by
 * replacing the address when the page was opened on a tool directly.
 */

import { OPS } from "../ops";
import { session } from "./session.svelte";

const TOOL_IDS = new Set(OPS.map((op) => op.id));

/** Whether Back leads to the home page: the tool was opened from it. */
let backGoesHome = false;
/** Set once the first address is shown, so a tool opened by a link counts as "from home". */
let started = false;

/** The address of a tool's page, for links. */
export function toolHref(id: string): string {
  return `#/${id}`;
}

function toolInAddress(): string | null {
  const id = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  return TOOL_IDS.has(id) ? id : null;
}

/** Show the page the address names. */
function sync(): void {
  const id = toolInAddress();
  const current = session.tool?.op ?? null;
  if (id === current) return;
  backGoesHome = id !== null && current === null && started;
  if (id) session.openTool(id);
  else session.closeTool();
}

export function startRouter(): void {
  // Back/forward fire popstate; a typed or linked hash fires hashchange.
  // `sync` does nothing when the page is already the right one.
  addEventListener("popstate", sync);
  addEventListener("hashchange", sync);
  sync();
  started = true;
}

/** Back to the home page, without leaving a tool page to go "forward" into by mistake. */
export function goHome(): void {
  if (backGoesHome) {
    history.back();
  } else {
    history.replaceState(null, "", location.pathname + location.search);
    sync();
  }
}
