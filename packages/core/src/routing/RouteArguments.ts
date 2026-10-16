import type { EndpointFilter } from "./EndpointFilter.js";
import { ModelBinding, resolveHandler } from "./ModelBinding.js";
import type { RouteHandler } from "./RouteHandler.js";

export interface RouteOptions {
  readonly filters?: readonly EndpointFilter[];
}

/**
 * Accepts `(handler, options?)` or `(binding, handler, options?)`, the forms
 * used by every map method, and returns the route handler and options.
 */
export function resolveRouteArguments(args: readonly unknown[]): {
  handler: RouteHandler;
  options: RouteOptions;
} {
  const [first, second, third] = args;

  if (typeof first === "function") {
    return {
      handler: first as RouteHandler,
      options: toOptions(second),
    };
  }

  if (
    typeof first === "object" &&
    first !== null &&
    typeof second === "function"
  ) {
    return {
      handler: resolveHandler(first as ModelBinding, second as RouteHandler),
      options: toOptions(third),
    };
  }

  throw new TypeError(
    "A route needs a handler, or a model binding followed by a handler.",
  );
}

function toOptions(value: unknown): RouteOptions {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "object" || value === null) {
    throw new TypeError("Route options must be an object.");
  }

  return value as RouteOptions;
}
