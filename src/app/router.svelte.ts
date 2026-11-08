/**
 * Hash-based routing (`#/tool/resize`): works on any static host, including
 * GitHub Pages, without server-side rewrites. Pages change inside a View
 * Transition where there is one, so a tool's patch on the home page grows
 * into the banner of its workspace (they share a `view-transition-name`)
 * and shrinks back on the way home.
 */

import { tick } from 'svelte';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export type Route =
  { page: 'home' } | { page: 'tool'; id: string } | { page: 'recipe'; id: string };

function parse(hash: string): Route {
  const [, page, id] = hash.replace(/^#/, '').split('/');
  if ((page === 'tool' || page === 'recipe') && id) return { page, id: decodeURIComponent(id) };
  return { page: 'home' };
}

class Router {
  route = $state<Route>(parse(location.hash));

  constructor() {
    addEventListener('hashchange', () => {
      const update = async () => {
        this.route = parse(location.hash);
        scrollTo({ top: 0 });
        await tick();
      };
      if (!document.startViewTransition || reducedMotion.matches) void update();
      else document.startViewTransition(update);
    });
  }

  go(route: Route): void {
    location.hash = route.page === 'home' ? '/' : `/${route.page}/${encodeURIComponent(route.id)}`;
  }
}

export const router = new Router();
