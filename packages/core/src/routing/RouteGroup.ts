import { HttpMethod, HttpMiddleware } from "../http/index.js";
import {
  EndpointFilter,
  ModelBinding,
  ModelHandler,
  resolveRouteArguments,
  RouteDefinition,
  RouteOptions,
  RouteRegistry,
  TypedRouteHandler,
} from "./index.js";

export function joinPaths(...parts: string[]): string {
  const segments = parts.join("/").split("/").filter(Boolean);

  return `/${segments.join("/")}`;
}

export class RouteGroup implements RouteRegistry {
  private readonly middlewares: HttpMiddleware[] = [];
  private readonly filters: EndpointFilter[] = [];

  constructor(
    private readonly prefix: string,
    private readonly parent: RouteRegistry,
  ) {}

  getPrefix(): string {
    return joinPaths(this.parent.getPrefix(), this.prefix);
  }

  getMiddlewares(): readonly HttpMiddleware[] {
    return [...this.parent.getMiddlewares(), ...this.middlewares];
  }

  getFilters(): readonly EndpointFilter[] {
    return [...this.parent.getFilters(), ...this.filters];
  }

  use(middleware: HttpMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  useFilter(filter: EndpointFilter): this {
    this.filters.push(filter);
    return this;
  }

  group(prefix: string): RouteGroup {
    return new RouteGroup(prefix, this);
  }

  mapGet<P extends string, B extends ModelBinding>(
    path: P,
    binding: B,
    handler: ModelHandler<B, P>,
    options?: RouteOptions,
  ): this;
  mapGet<P extends string>(
    path: P,
    handler: TypedRouteHandler<P>,
    options?: RouteOptions,
  ): this;
  mapGet(path: string, ...args: unknown[]): this {
    return this.addRoute("GET", path, args);
  }

  mapPost<P extends string, B extends ModelBinding>(
    path: P,
    binding: B,
    handler: ModelHandler<B, P>,
    options?: RouteOptions,
  ): this;
  mapPost<P extends string>(
    path: P,
    handler: TypedRouteHandler<P>,
    options?: RouteOptions,
  ): this;
  mapPost(path: string, ...args: unknown[]): this {
    return this.addRoute("POST", path, args);
  }

  mapPut<P extends string, B extends ModelBinding>(
    path: P,
    binding: B,
    handler: ModelHandler<B, P>,
    options?: RouteOptions,
  ): this;
  mapPut<P extends string>(
    path: P,
    handler: TypedRouteHandler<P>,
    options?: RouteOptions,
  ): this;
  mapPut(path: string, ...args: unknown[]): this {
    return this.addRoute("PUT", path, args);
  }

  mapPatch<P extends string, B extends ModelBinding>(
    path: P,
    binding: B,
    handler: ModelHandler<B, P>,
    options?: RouteOptions,
  ): this;
  mapPatch<P extends string>(
    path: P,
    handler: TypedRouteHandler<P>,
    options?: RouteOptions,
  ): this;
  mapPatch(path: string, ...args: unknown[]): this {
    return this.addRoute("PATCH", path, args);
  }

  mapDelete<P extends string, B extends ModelBinding>(
    path: P,
    binding: B,
    handler: ModelHandler<B, P>,
    options?: RouteOptions,
  ): this;
  mapDelete<P extends string>(
    path: P,
    handler: TypedRouteHandler<P>,
    options?: RouteOptions,
  ): this;
  mapDelete(path: string, ...args: unknown[]): this {
    return this.addRoute("DELETE", path, args);
  }

  registerRoute(route: RouteDefinition): void {
    this.parent.registerRoute(route);
  }

  private addRoute(
    method: HttpMethod,
    path: string,
    args: readonly unknown[],
  ): this {
    const { handler, options } = resolveRouteArguments(args);

    this.parent.registerRoute({
      method,
      path: joinPaths(this.getPrefix(), path),
      handler,
      middlewares: this.getMiddlewares(),
      filters: [...this.getFilters(), ...(options.filters ?? [])],
    });

    return this;
  }
}
