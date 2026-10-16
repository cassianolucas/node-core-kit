import Fastify from "fastify";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifyServerOptions,
} from "fastify";

import {
  AppError,
  CloseOptions,
  Container,
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

type Handler = RouteHandler;

export class FastifyAdapter implements HttpAdapter {
  private readonly server: FastifyInstance;
  private readonly pipeline = new HttpPipeline();
  private registered = false;
  private services?: Container;
  private middlewares: readonly HttpMiddleware[] = [];

  constructor(options: FastifyServerOptions = {}) {
    this.server = Fastify(options);

    // Bodies are parsed here, not by Fastify's defaults, so every adapter
    // gives handlers the same values: parsed JSON, undefined when empty, and
    // text for other content types.
    this.server.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_request, raw, done) => parseJsonBody(raw as string, done),
    );
    this.server.addContentTypeParser(
      "*",
      { parseAs: "string" },
      (_request, raw, done) =>
        done(null, (raw as string).length > 0 ? raw : undefined),
    );
  }

  get port(): number | undefined {
    const address = this.server.server.address();

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
      throw new Error("Fastify routes have already been registered");
    }

    this.registered = true;
    this.services = services;
    this.middlewares = middlewares;
    this.server.server.requestTimeout = options.requestTimeoutMs;

    this.server.setNotFoundHandler((request, reply) =>
      this.run(
        request,
        reply,
        () => {
          throw new NotFoundError("Route not found.");
        },
        [],
      ),
    );

    this.server.setErrorHandler((error, request, reply) =>
      this.handleFrameworkError(error, request, reply),
    );

    for (const route of routes) {
      this.server.route({
        method: route.method,
        url: route.path,
        bodyLimit: options.bodyLimit,
        handler: (request, reply) =>
          this.run(request, reply, route.handler, route.middlewares),
      });
    }
  }

  async listen(options: ListenOptions): Promise<void> {
    await this.server.listen({ port: options.port, host: options.host });
  }

  /**
   * Stops accepting connections and waits for in-flight requests. Connections
   * still open after `timeoutMs` are closed, which ends their requests.
   */
  async close(options: CloseOptions): Promise<void> {
    const closing = this.server.close();
    const outcome = await raceWithTimeout(closing, options.timeoutMs, () =>
      this.server.server.closeIdleConnections(),
    );

    if (outcome === "timeout") {
      this.server.server.closeAllConnections();
      await closing;
    }
  }

  private async run(
    request: FastifyRequest,
    reply: FastifyReply,
    handler: Handler,
    routeMiddlewares: readonly HttpMiddleware[],
  ): Promise<void> {
    const context: HttpContext = {
      request: {
        method: request.method as HttpMethod,
        path: new URL(request.url, "http://localhost").pathname,
        params: request.params as Record<string, string>,
        query: request.query as Record<string, unknown>,
        headers: request.headers,
        body: request.body,
      },
      response: toHttpResponse(reply),
      services: this.services as Container,
    };

    try {
      await this.pipeline.execute(
        context,
        [...this.middlewares, ...routeMiddlewares],
        handler,
      );
    } catch (error) {
      request.log.error({ err: error }, "Unhandled request error");

      if (!reply.sent) {
        reply
          .code(500)
          .header("content-type", "application/problem+json")
          .send({
            type: "about:blank",
            title: "Internal Server Error",
            status: 500,
            detail: "An internal error occurred.",
            instance: new URL(request.url, "http://localhost").pathname,
            code: "INTERNAL_SERVER_ERROR",
          });
      }
    }
  }

  /**
   * Errors raised by Fastify itself, such as an oversized body or malformed
   * JSON, are sent through the pipeline as application errors, so they get the
   * same Problem Details response as errors thrown by handlers.
   */
  private async handleFrameworkError(
    error: unknown,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const statusCode = (error as { statusCode?: number }).statusCode;

    if (
      typeof statusCode !== "number" ||
      statusCode < 400 ||
      statusCode >= 500
    ) {
      request.log.error({ err: error }, "Unhandled request error");
      await this.run(
        request,
        reply,
        () => {
          throw error;
        },
        [],
      );
      return;
    }

    const { message, code } = clientErrorFor(statusCode);

    await this.run(
      request,
      reply,
      () => {
        throw new AppError(message, code, statusCode);
      },
      [],
    );
  }
}

function clientErrorFor(statusCode: number): { message: string; code: string } {
  if (statusCode === 413) {
    return { message: "Request body is too large.", code: "PAYLOAD_TOO_LARGE" };
  }

  return {
    message: "The request could not be processed.",
    code: "BAD_REQUEST",
  };
}

function toHttpResponse(reply: FastifyReply): HttpResponse {
  return {
    get statusCode() {
      return reply.statusCode;
    },

    get sent() {
      return reply.sent;
    },

    status(code: number) {
      reply.code(code);
      return this;
    },

    header(name: string, value: string) {
      reply.header(name, value);
      return this;
    },

    json(body: unknown) {
      // Serialized here so a string body is encoded as JSON too, as on every adapter.
      if (!reply.hasHeader("content-type")) {
        reply.header("content-type", "application/json; charset=utf-8");
      }

      reply.send(JSON.stringify(body));
    },

    end() {
      reply.send();
    },
  };
}

/**
 * Waits for `pending` to settle, or for `timeoutMs` to pass. While waiting,
 * `sweep` runs regularly, so keep-alive connections that become idle are closed.
 */
async function raceWithTimeout(
  pending: Promise<unknown>,
  timeoutMs: number,
  sweep: () => void,
): Promise<"settled" | "timeout"> {
  const settled = pending.then(() => "settled" as const);
  const timedOut = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), timeoutMs).unref(),
  );
  const sweeper = setInterval(sweep, 50);

  try {
    return await Promise.race([settled, timedOut]);
  } finally {
    clearInterval(sweeper);
  }
}

function parseJsonBody(
  raw: string,
  done: (error: Error | null, body?: unknown) => void,
): void {
  if (raw.length === 0) {
    done(null, undefined);
    return;
  }

  try {
    done(null, JSON.parse(raw));
  } catch {
    const error = new Error("The request body is not valid JSON.") as Error & {
      statusCode: number;
    };
    error.statusCode = 400;
    done(error);
  }
}
