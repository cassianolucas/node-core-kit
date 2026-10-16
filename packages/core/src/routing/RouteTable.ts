import { applyFilters, EndpointFilter } from "./EndpointFilter.js";
import type { RouteDefinition } from "./RouteDefinition.js";

function normalizeRoutePath(path: string): string {
  if (path === "/") {
    return "/";
  }

  return path.replace(/\/+$/, "");
}

/** Holds the routes of an application and builds the definitions for the adapter. */
export class RouteTable {
  private readonly routes: RouteDefinition[] = [];

  register(route: RouteDefinition): void {
    const normalizedPath = normalizeRoutePath(route.path);
    const duplicate = this.routes.some(
      (existing) =>
        existing.method === route.method &&
        normalizeRoutePath(existing.path) === normalizedPath,
    );

    if (duplicate) {
      throw new Error(`Duplicate route: ${route.method} ${normalizedPath}.`);
    }

    this.routes.push({
      ...route,
      path: normalizedPath,
      filters: [...(route.filters ?? [])],
    });
  }

  /** Global filters run before the filters of each route. */
  build(globalFilters: readonly EndpointFilter[]): RouteDefinition[] {
    return this.routes.map((route) => ({
      ...route,
      handler: applyFilters(
        [...globalFilters, ...(route.filters ?? [])],
        route.handler,
      ),
      filters: [],
    }));
  }
}
