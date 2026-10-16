import { ValidationError } from "../Errors.js";
import type { HttpContext } from "../http/index.js";
import type { RouteHandler } from "./RouteHandler.js";
import type { RouteContext } from "./RouteParams.js";

/**
 * Anything that turns raw input into a typed model: a function, or an object
 * with a `parse` method. Libraries such as zod satisfy the second form.
 */
export type ModelParser<T = unknown> =
  ((input: unknown) => T) | { parse(input: unknown): T };

export interface ModelBinding {
  readonly body?: ModelParser;
  readonly query?: ModelParser;
}

type ParserOutput<P> = P extends (input: unknown) => infer T
  ? T
  : P extends { parse(input: unknown): infer T }
    ? T
    : never;

export type BoundModel<B> = (B extends { body: infer P }
  ? { body: ParserOutput<P> }
  : unknown) &
  (B extends { query: infer Q } ? { query: ParserOutput<Q> } : unknown);

export type ModelHandler<B, P extends string = string> = (
  context: RouteContext<P> & BoundModel<B>,
) => unknown | Promise<unknown>;

const MESSAGES = {
  body: "Invalid request body.",
  query: "Invalid query parameters.",
} as const;

function parseModel(
  parser: ModelParser,
  input: unknown,
  source: keyof typeof MESSAGES,
): unknown {
  try {
    return typeof parser === "function" ? parser(input) : parser.parse(input);
  } catch (error) {
    // A ValidationError thrown by the parser keeps its message. Any other
    // error becomes a generic 400, so internal details are not exposed.
    if (error instanceof ValidationError) {
      throw error;
    }

    throw new ValidationError(MESSAGES[source]);
  }
}

/**
 * Builds the route handler for either `handler` alone or `binding` + `handler`.
 * Parsed values are exposed on the context as `body` and `query`.
 */
export function resolveHandler(
  bindingOrHandler: ModelBinding | RouteHandler,
  handler?: ((context: never) => unknown) | RouteHandler,
): RouteHandler {
  if (typeof bindingOrHandler === "function") {
    return bindingOrHandler;
  }

  if (!handler) {
    throw new Error("A handler is required when a model binding is provided.");
  }

  const binding = bindingOrHandler;
  const bound = handler as (context: HttpContext) => unknown;

  return async (context) => {
    const model: Record<string, unknown> = { ...context };

    if (binding.body) {
      model.body = parseModel(binding.body, context.request.body, "body");
    }

    if (binding.query) {
      model.query = parseModel(binding.query, context.request.query, "query");
    }

    return bound(model as unknown as HttpContext);
  };
}
