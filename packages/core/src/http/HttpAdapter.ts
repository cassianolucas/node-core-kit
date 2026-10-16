import { Container, HttpMiddleware } from "../index.js";
import { RouteDefinition } from "../routing/index.js";

/** Settings applied to every request, set before the server starts. */
export interface HttpServerOptions {
  /** Maximum request body size in bytes. */
  readonly bodyLimit: number;
  /** Time allowed to receive a complete request, in milliseconds. */
  readonly requestTimeoutMs: number;
}

export interface ListenOptions {
  readonly port: number;
  readonly host: string;
}

export interface CloseOptions {
  /**
   * How long in-flight requests may run before their connections are closed.
   */
  readonly timeoutMs: number;
}

/**
 * Contract for HTTP servers. Every adapter must:
 * - run each request through `HttpPipeline`, so middleware, filters, results
 *   and error handling behave the same on every server;
 * - answer unknown routes and oversized bodies with Problem Details responses;
 * - finish in-flight requests on `close()` within the timeout.
 */
export interface HttpAdapter {
  register(
    routes: readonly RouteDefinition[],
    services: Container,
    middlewares: readonly HttpMiddleware[],
    options: HttpServerOptions,
  ): void;

  listen(options: ListenOptions): Promise<void>;
  close(options: CloseOptions): Promise<void>;

  /** Port the server listens on, available after `listen()`. */
  readonly port?: number | undefined;
}
