/**
 * Hash-based routing (`#/tool/resize`): works on any static host, including
 * GitHub Pages, without server-side rewrites.
 */

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
      this.route = parse(location.hash);
      scrollTo({ top: 0 });
    });
  }

  go(route: Route): void {
    location.hash = route.page === 'home' ? '/' : `/${route.page}/${encodeURIComponent(route.id)}`;
  }
}

export const router = new Router();
