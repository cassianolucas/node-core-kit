import { HttpContext } from "../http/index.js";
import { RouteHandler } from "./index.js";

export interface EndpointBinding<T> {
  resolve(context: HttpContext): T;
}

type BindingValue<T> = T extends EndpointBinding<infer TValue> ? TValue : never;
type BindingValues<T extends readonly EndpointBinding<unknown>[]> = {
  [K in keyof T]: BindingValue<T[K]>;
};

export function routeParam(name: string): EndpointBinding<string> {
  return {
    resolve(context) {
      const value = context.request.params[name];
      if (value === undefined)
        throw new Error(`Missing route parameter: ${name}`);
      return value;
    },
  };
}

export function queryParam(name: string): EndpointBinding<string | undefined> {
  return {
    resolve(context) {
      const value = context.request.query[name];
      if (value === undefined || value === null) return undefined;
      return Array.isArray(value) ? String(value[0]) : String(value);
    },
  };
}

export function body<T = unknown>(): EndpointBinding<T> {
  return { resolve: (context) => context.request.body as T };
}

export function fromServices<T>(
  token: abstract new (...args: never[]) => T,
): EndpointBinding<T>;
export function fromServices<T>(token: string | symbol): EndpointBinding<T>;
export function fromServices<T>(
  token: string | symbol | (abstract new (...args: never[]) => T),
): EndpointBinding<T> {
  return { resolve: (context) => context.services.get<T>(token) };
}

export function endpoint<TBindings extends readonly EndpointBinding<unknown>[]>(
  handler: (...args: BindingValues<TBindings>) => unknown | Promise<unknown>,
  ...bindings: TBindings
): RouteHandler {
  return async (context) =>
    handler(
      ...(bindings.map((binding) =>
        binding.resolve(context),
      ) as BindingValues<TBindings>),
    );
}
