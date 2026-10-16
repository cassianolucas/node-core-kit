import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http";

import {
  AppError,
  CloseOptions,
  Container,
  findRoute,
  HttpAdapter,
  HttpContext,
  HttpMethod,
  HttpMiddleware,
  HttpPipeline,
  HttpResponse,
  HttpServerOptions,
  ListenOptions,
  NotFoundError,
  RouteDefinition,
  RouteHandler,
} from "node-core-kit";

const DEFAULT_BODY_LIMIT = 1024 * 1024;

/**
 * HTTP adapter built on `node:http`. It has no runtime dependencies, and it
 * runs every request through the same pipeline as the other adapters.
 */
export class NodeHttpAdapter implements HttpAdapter {
  private readonly server: Server;
  private readonly pipeline = new HttpPipeline();
  private routes: readonly RouteDefinition[] = [];
  private services?: Container;
  private middlewares: readonly HttpMiddleware[] = [];
  private bodyLimit = DEFAULT_BODY_LIMIT;
  private registered = false;

  constructor() {
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });
  }

  get port(): number | undefined {
    const address = this.server.address();

    return address !== null && typeof address === "object"
      ? address.port
      : undefined;
  }

  register(
    routes: readonly RouteDefinition[],
    services: Container,
    middlewares: readonly HttpMiddleware[],
    options: HttpServerOptions,
  ): void {
    if (this.registered) {
      throw new Error("Node HTTP routes have already been registered");
    }

    this.registered = true;
    this.routes = routes;
    this.services = services;
    this.middlewares = middlewares;
    this.bodyLimit = options.bodyLimit;
    this.server.requestTimeout = options.requestTimeoutMs;
  }

  listen(options: ListenOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => reject(error);

      this.server.once("error", onError);
      this.server.listen(options.port, options.host, () => {
        this.server.off("error", onError);
        resolve();
      });
    });
  }

  /**
   * Stops accepting connections and waits for in-flight requests. Connections
   * still open after `timeoutMs` are closed, which ends their requests.
   */
  async close(options: CloseOptions): Promise<void> {
    const closing = new Promise<void>((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
    const outcome = await raceWithTimeout(closing, options.timeoutMs, () =>
      this.server.closeIdleConnections(),
    );

    if (outcome === "timeout") {
      this.server.closeAllConnections();
    }

    await closing;
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? "/", "http://localhost");
    const method = (request.method ?? "GET") as HttpMethod;
    const match = findRoute(this.routes, method, url.pathname);

    let body: unknown;
    let bodyError: unknown;

    try {
      body = await readBody(request, this.bodyLimit);
    } catch (error) {
      bodyError = error;
    }

    const context: HttpContext = {
      request: {
        method,
        path: url.pathname,
        params: match?.params ?? {},
        query: toQuery(url.searchParams),
        headers: request.headers as Record<
          string,
          string | string[] | undefined
        >,
        body,
      },
      response: toHttpResponse(response),
      services: this.services as Container,
    };

    const handler: RouteHandler = match
      ? match.route.handler
      : () => {
          throw new NotFoundError("Route not found.");
        };

    try {
      await this.pipeline.execute(
        context,
        [...this.middlewares, ...(match?.route.middlewares ?? [])],
        (ctx) => {
          if (bodyError !== undefined && match) {
            throw bodyError;
          }

          return handler(ctx);
        },
      );
    } catch {
      if (!response.headersSent) {
        writeInternalError(response, url.pathname);
      }
    }
  }
}

/**
 * Reads the request body up to `limit` bytes. Oversized bodies are rejected
 * with 413, and the rest of the request is discarded.
 */
function readBody(request: IncomingMessage, limit: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    request.on("data", (chunk: Buffer) => {
      if (settled) {
        return;
      }

      size += chunk.length;

      if (size > limit) {
        settled = true;
        reject(
          new AppError("Request body is too large.", "PAYLOAD_TOO_LARGE", 413),
        );
        request.resume();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => {
      if (settled) {
        return;
      }

      settled = true;

      try {
        resolve(
          parseBody(
            Buffer.concat(chunks).toString("utf8"),
            request.headers["content-type"],
          ),
        );
      } catch (error) {
        reject(error);
      }
    });

    request.on("error", (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

function parseBody(raw: string, contentType: string | undefined): unknown {
  if (raw.length === 0) {
    return undefined;
  }

  if (!contentType?.includes("application/json")) {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError(
      "The request body is not valid JSON.",
      "BAD_REQUEST",
      400,
    );
  }
}

function toHttpResponse(response: ServerResponse): HttpResponse {
  return {
    get statusCode() {
      return response.statusCode;
    },

    get sent() {
      return response.headersSent;
    },

    status(code: number) {
      response.statusCode = code;
      return this;
    },

    header(name: string, value: string) {
      response.setHeader(name, value);
      return this;
    },

    json(body: unknown) {
      if (!response.hasHeader("content-type")) {
        response.setHeader("content-type", "application/json; charset=utf-8");
      }

      response.end(JSON.stringify(body));
    },

    end() {
      response.end();
    },
  };
}

function writeInternalError(response: ServerResponse, instance: string): void {
  response.statusCode = 500;
  response.setHeader("content-type", "application/problem+json");
  response.end(
    JSON.stringify({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      detail: "An internal error occurred.",
      instance,
      code: "INTERNAL_SERVER_ERROR",
    }),
  );
}

function toQuery(params: URLSearchParams): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};

  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    query[key] = values.length === 1 ? (values[0] ?? "") : values;
  }

  return query;
}

/**
 * Waits for `pending` to settle, or for `timeoutMs` to pass. While waiting,
 * `sweep` runs regularly, so keep-alive connections that become idle are closed.
 */
function raceWithTimeout(
  pending: Promise<unknown>,
  timeoutMs: number,
  sweep: () => void,
): Promise<"settled" | "timeout"> {
  const settled = pending.then(() => "settled" as const);
  const timedOut = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), timeoutMs).unref();
  });
  const sweeper = setInterval(sweep, 50);

  return Promise.race([settled, timedOut]).finally(() =>
    clearInterval(sweeper),
  );
}
