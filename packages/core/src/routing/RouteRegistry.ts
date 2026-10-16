import { HttpMiddleware } from "../http/index.js";
import { RouteDefinition, RouteGroup, RouteHandler } from "./index.js";

export interface RouteRegistry {
  mapGet(path: string, handler: RouteHandler): this;
  mapPost(path: string, handler: RouteHandler): this;
  mapPut(path: string, handler: RouteHandler): this;
  mapPatch(path: string, handler: RouteHandler): this;
  mapDelete(path: string, handler: RouteHandler): this;

  group(prefix: string): RouteGroup;

  use(middleware: HttpMiddleware): this;

  registerRoute(route: RouteDefinition): void;

  getPrefix(): string;
  getMiddlewares(): readonly HttpMiddleware[];
}
