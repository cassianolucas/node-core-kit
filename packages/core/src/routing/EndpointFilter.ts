import type { HttpContext } from "../http/index.js";
import type { RouteHandler } from "./RouteHandler.js";

export type EndpointFilterNext = () => Promise<unknown>;

export type EndpointFilter = (
  context: HttpContext,
  next: EndpointFilterNext,
) => unknown | Promise<unknown>;

/**
 * Wraps a handler with filters. The first filter runs first; each filter
 * decides whether to call `next()` and can change the result it returns.
 */
export function applyFilters(
  filters: readonly EndpointFilter[],
  handler: RouteHandler,
): RouteHandler {
  if (filters.length === 0) {
    return handler;
  }

  return (context) => {
    const run = (index: number): Promise<unknown> => {
      const filter = filters[index];

      if (!filter) {
        return Promise.resolve(handler(context));
      }

      return Promise.resolve(filter(context, () => run(index + 1)));
    };

    return run(0);
  };
}
