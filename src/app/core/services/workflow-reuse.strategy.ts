import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

/** The three step pages cached so their state survives back/forward navigation. */
const STEP_PATHS = new Set(['import', 'settings', 'output']);

/** Detached handles expose the underlying component ref so we can destroy them. */
interface DestroyableHandle {
  componentRef?: { destroy(): void };
}

/**
 * Keeps the import / settings / output pages of the *current* tool alive when
 * the user moves between steps, so their form values and editor state are
 * preserved. The cache is dropped (and the components destroyed) whenever the
 * workflow switches tools or resets — see {@link ToolSessionService}.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowReuseStrategy implements RouteReuseStrategy {
  private readonly handles = new Map<string, DetachedRouteHandle>();

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.keyFor(route) !== null;
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const key = this.keyFor(route);
    if (!key) {
      return;
    }
    if (handle) {
      this.handles.set(key, handle);
    } else {
      this.handles.delete(key);
    }
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const key = this.keyFor(route);
    return key !== null && this.handles.has(key);
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const key = this.keyFor(route);
    return key ? (this.handles.get(key) ?? null) : null;
  }

  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig;
  }

  /** Drop every cached step page, destroying the components they hold. */
  clear(): void {
    for (const handle of this.handles.values()) {
      (handle as DestroyableHandle).componentRef?.destroy();
    }
    this.handles.clear();
  }

  private keyFor(route: ActivatedRouteSnapshot): string | null {
    const path = route.routeConfig?.path;
    if (!path || !STEP_PATHS.has(path)) {
      return null;
    }
    const toolId = route.parent?.data?.['toolId'];
    return typeof toolId === 'string' ? `${toolId}/${path}` : null;
  }
}
