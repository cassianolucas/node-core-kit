import { ApplicationOptions } from "./ApplicationOptions.js";
import { Container } from "./Container.js";
import { ErrorHandlerMiddleware } from "./ErrorHandlerMiddleware.js";
import { HttpAdapter, HttpMethod, HttpMiddleware } from "./http/index.js";
import { RouteDefinition, RouteGroup, RouteHandler } from "./routing/index.js";

function normalizeRoutePath(path: string): string {
  if (path === "/") {
    return "/";
  }

  return path.replace(/\/+$/, "");
}

export class Application {
  readonly services = new Container();

  private readonly routes: RouteDefinition[] = [];
  private readonly middlewares: HttpMiddleware[] = [
    new ErrorHandlerMiddleware(),
  ];

  private readonly http: HttpAdapter;
  private readonly port: number;

  private started = false;

  constructor(options: ApplicationOptions) {
    this.http = options.http;
    this.port = options.port ?? 3000;
  }

  use(middleware: HttpMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  getPrefix(): string {
    return "";
  }

  // Global middleware is applied by the HTTP adapter for every route, so it is
  // not repeated here. Returning it would run it twice for group routes.
  getMiddlewares(): readonly HttpMiddleware[] {
    return [];
  }

  registerRoute(route: RouteDefinition): void {
    const normalizedPath = normalizeRoutePath(route.path);

    const duplicate = this.routes.find(
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
    });
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

  async start(): Promise<void> {
    if (this.started) {
      throw new Error("Application already started");
    }

    this.http.register(this.routes, this.services, this.middlewares);

    await this.http.listen(this.port);
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    await this.http.close();
    this.started = false;
  }

  private add(method: HttpMethod, path: string, handler: RouteHandler): this {
    this.registerRoute({
      method,
      path,
      handler,
      middlewares: [],
    });

    return this;
  }
}
