import { HttpMiddleware } from "../http/index.js";
import {
  EndpointFilter,
  ModelBinding,
  ModelHandler,
  RouteDefinition,
  RouteGroup,
  RouteOptions,
  TypedRouteHandler,
} from "./index.js";

export interface RouteRegistry {
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

  group(prefix: string): RouteGroup;

  use(middleware: HttpMiddleware): this;

  registerRoute(route: RouteDefinition): void;

  getPrefix(): string;
  getMiddlewares(): readonly HttpMiddleware[];
  getFilters(): readonly EndpointFilter[];
}
