import { ApplicationOptions } from "./ApplicationOptions.js";
import { ApplicationState } from "./ApplicationState.js";
import { Container } from "./Container.js";
import { ErrorHandlerMiddleware } from "./ErrorHandlerMiddleware.js";
import type { ExceptionHandler } from "./ExceptionHandler.js";
import { waitForShutdownSignal } from "./Hosting.js";
import { HttpAdapter, HttpMethod, HttpMiddleware } from "./http/index.js";
import {
  EndpointFilter,
  ModelBinding,
  ModelHandler,
  RouteDefinition,
  RouteGroup,
  RouteOptions,
  RouteRegistry,
  RouteTable,
  resolveRouteArguments,
  TypedRouteHandler,
} from "./routing/index.js";

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_BODY_LIMIT = 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export class Application implements RouteRegistry {
  readonly services = new Container();

  private readonly routes = new RouteTable();
  private readonly globalFilters: EndpointFilter[] = [];
  private readonly exceptionHandlers: ExceptionHandler[] = [];
  private readonly middlewares: HttpMiddleware[] = [
    new ErrorHandlerMiddleware(this.exceptionHandlers),
  ];
  private readonly http: HttpAdapter;
  private readonly port: number;
  private readonly host: string;
  private readonly bodyLimit: number;
  private readonly requestTimeoutMs: number;
  private readonly shutdownTimeoutMs: number;
  private state: ApplicationState = "created";
  private adapterRegistered = false;
  private configurationLocked = false;

  constructor(options: ApplicationOptions) {
    this.http = options.http;
    this.port = options.port ?? DEFAULT_PORT;
    this.host = options.host ?? DEFAULT_HOST;
    this.bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.shutdownTimeoutMs =
      options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;

    assertPort(this.port);
    assertPositive("bodyLimit", this.bodyLimit);
    assertPositive("requestTimeoutMs", this.requestTimeoutMs);
    assertPositive("shutdownTimeoutMs", this.shutdownTimeoutMs);
  }

  use(middleware: HttpMiddleware): this {
    this.ensureConfigurable();
    this.middlewares.push(middleware);
    return this;
  }

  addExceptionHandler(handler: ExceptionHandler): this {
    this.ensureConfigurable();
    this.exceptionHandlers.push(handler);
    return this;
  }

  useFilter(filter: EndpointFilter): this {
    this.ensureConfigurable();
    this.globalFilters.push(filter);
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

  // Global filters are combined with each route's filters in start(), so they
  // are not repeated here.
  getFilters(): readonly EndpointFilter[] {
    return [];
  }

  registerRoute(route: RouteDefinition): void {
    this.ensureConfigurable();
    this.routes.register(route);
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

  /**
   * Starts the application, waits for SIGINT or SIGTERM, then stops it and
   * disposes its services. In-flight requests get `shutdownTimeoutMs` to finish.
   */
  async run(): Promise<void> {
    await this.start();
    await waitForShutdownSignal();
    await this.dispose();
  }

  async start(): Promise<void> {
    if (this.state === "disposed") {
      throw new Error("Application has been disposed.");
    }
    if (this.state === "started" || this.state === "starting") {
      throw new Error("Application is already started or starting.");
    }
    if (this.state === "stopped") {
      throw new Error(
        "Application has been stopped and cannot be restarted. Create a new Application instead.",
      );
    }
    if (this.state === "stopping") {
      throw new Error("Application is stopping.");
    }
    this.state = "starting";
    this.configurationLocked = true;
    try {
      if (!this.adapterRegistered) {
        this.http.register(
          this.routes.build(this.globalFilters),
          this.services,
          this.middlewares,
          {
            bodyLimit: this.bodyLimit,
            requestTimeoutMs: this.requestTimeoutMs,
          },
        );
        this.adapterRegistered = true;
      }
      await this.http.listen({ port: this.port, host: this.host });
      this.state = "started";
    } catch (error) {
      this.state = "created";
      if (!this.adapterRegistered) {
        this.configurationLocked = false;
      }
      try {
        await this.http.close({ timeoutMs: this.shutdownTimeoutMs });
      } catch {
        // Preserve the startup error; the adapter may not have started listening.
      }
      throw error;
    }
  }

  /** The port the server listens on. Useful when the configured port is 0. */
  get listeningPort(): number | undefined {
    return this.http.port;
  }

  async stop(): Promise<void> {
    if (
      this.state === "created" ||
      this.state === "stopped" ||
      this.state === "disposed"
    ) {
      return;
    }
    if (this.state !== "started") {
      throw new Error(`Cannot stop application while it is ${this.state}.`);
    }
    this.state = "stopping";
    try {
      await this.http.close({ timeoutMs: this.shutdownTimeoutMs });
      this.state = "stopped";
    } catch (error) {
      this.state = "started";
      throw error;
    }
  }

  async dispose(): Promise<void> {
    if (this.state === "disposed") {
      return;
    }
    if (this.state === "started") {
      await this.stop();
    }
    if (this.state === "starting" || this.state === "stopping") {
      throw new Error(`Cannot dispose application while it is ${this.state}.`);
    }
    await this.services.dispose();
    this.state = "disposed";
  }

  private addRoute(
    method: HttpMethod,
    path: string,
    args: readonly unknown[],
  ): this {
    const { handler, options } = resolveRouteArguments(args);

    this.registerRoute({
      method,
      path,
      handler,
      middlewares: [],
      filters: [...(options.filters ?? [])],
    });

    return this;
  }

  private ensureConfigurable(): void {
    if (this.configurationLocked) {
      throw new Error(
        "Application configuration cannot be changed after startup has begun.",
      );
    }
  }
}

function assertPort(port: number): void {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError(
      `port must be an integer between 0 and 65535, got ${port}.`,
    );
  }
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number, got ${value}.`);
  }
}
