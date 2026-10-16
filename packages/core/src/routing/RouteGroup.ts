import { HttpMethod, HttpMiddleware } from "../http/index.js";
import { RouteDefinition, RouteHandler, RouteRegistry } from "./index.js";

export function joinPaths(...parts: string[]): string {
  const segments = parts.join("/").split("/").filter(Boolean);

  return `/${segments.join("/")}`;
}

export class RouteGroup implements RouteRegistry {
  private readonly middlewares: HttpMiddleware[] = [];

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

  use(middleware: HttpMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  group(prefix: string): RouteGroup {
    return new RouteGroup(prefix, this);
  }

  mapGet(path: string, handler: RouteHandler): this {
    return this.add("GET", path, handler);
  }

  mapPost(path: string, handler: RouteHandler): this {
    return this.add("POST", path, handler);
  }

  mapPut(path: string, handler: RouteHandler): this {
    return this.add("PUT", path, handler);
  }

  mapPatch(path: string, handler: RouteHandler): this {
    return this.add("PATCH", path, handler);
  }

  mapDelete(path: string, handler: RouteHandler): this {
    return this.add("DELETE", path, handler);
  }

  registerRoute(route: RouteDefinition): void {
    this.parent.registerRoute(route);
  }

  private add(method: HttpMethod, path: string, handler: RouteHandler): this {
    this.parent.registerRoute({
      method,
      path: joinPaths(this.getPrefix(), path),
      handler,
      middlewares: this.getMiddlewares(),
    });

    return this;
  }
}
