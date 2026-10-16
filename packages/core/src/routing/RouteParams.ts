import type { HttpContext, HttpRequest } from "../http/index.js";

type RouteParamNames<P extends string> =
  P extends `${string}:${infer Name}/${infer Rest}`
    ? Name | RouteParamNames<`/${Rest}`>
    : P extends `${string}:${infer Name}`
      ? Name
      : never;

/**
 * Route parameters inferred from a literal path: "/users/:id" gives { id: string }.
 * A path typed as plain `string` gives an untyped record.
 */
export type RouteParams<P extends string> = string extends P
  ? Record<string, string>
  : { readonly [K in RouteParamNames<P>]: string };

export type RouteContext<P extends string = string> = HttpContext & {
  readonly request: HttpRequest & { readonly params: RouteParams<P> };
};

export type TypedRouteHandler<P extends string = string> = (
  context: RouteContext<P>,
) => unknown | Promise<unknown>;
