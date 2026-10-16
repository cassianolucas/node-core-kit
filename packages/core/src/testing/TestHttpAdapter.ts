import {
  Container,
  HttpContext,
  HttpMiddleware,
  HttpMethod,
  HttpResponse,
  NotFoundError,
} from "../index.js";
import { HttpAdapter, HttpServerOptions } from "../http/index.js";
import { HttpPipeline } from "../http/index.js";
import { findRoute } from "../routing/RouteMatcher.js";
import type { RouteDefinition } from "../routing/index.js";

export interface TestRequestOptions {
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface TestResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

/**
 * An in-memory adapter for tests. It runs requests through the same pipeline
 * as a real server, without opening a port.
 *
 *   const http = new TestHttpAdapter();
 *   const app = new Application({ http });
 *   await app.start();
 *   const response = await http.request("GET", "/health");
 */
export class TestHttpAdapter implements HttpAdapter {
  private routes: readonly RouteDefinition[] = [];
  private services?: Container;
  private middlewares: readonly HttpMiddleware[] = [];
  private readonly pipeline = new HttpPipeline();

  register(
    routes: readonly RouteDefinition[],
    services: Container,
    middlewares: readonly HttpMiddleware[],
    _options: HttpServerOptions,
  ): void {
    this.routes = routes;
    this.services = services;
    this.middlewares = middlewares;
  }

  async listen(): Promise<void> {}

  async close(): Promise<void> {}

  async request(
    method: HttpMethod,
    url: string,
    options: TestRequestOptions = {},
  ): Promise<TestResponse> {
    if (!this.services) {
      throw new Error("Call app.start() before sending test requests.");
    }

    const parsed = new URL(url, "http://localhost");
    const matched = findRoute(this.routes, method, parsed.pathname);
    const response = new CollectingResponse();

    const context: HttpContext = {
      request: {
        method,
        path: parsed.pathname,
        params: matched?.params ?? {},
        query: toQuery(parsed.searchParams),
        headers: lowercaseKeys(options.headers ?? {}),
        body: options.body,
      },
      response,
      services: this.services,
    };

    const route = matched?.route ?? {
      method,
      path: parsed.pathname,
      handler: () => {
        throw new NotFoundError("Route not found.");
      },
      middlewares: [],
      filters: [],
    };

    await this.pipeline.execute(
      context,
      [...this.middlewares, ...route.middlewares],
      route.handler,
    );

    return response.toResult();
  }
}

class CollectingResponse implements HttpResponse {
  statusCode = 200;
  sent = false;
  private readonly headers: Record<string, string> = {};
  private payload: unknown;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  header(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  json(body: unknown): void {
    this.payload = body;
    this.sent = true;
  }

  end(): void {
    this.sent = true;
  }

  toResult(): TestResponse {
    return {
      status: this.statusCode,
      headers: { ...this.headers },
      body: this.payload,
    };
  }
}

function toQuery(params: URLSearchParams): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};

  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    query[key] = values.length === 1 ? (values[0] ?? "") : values;
  }

  return query;
}

/** Real servers deliver request header names in lowercase, so the test adapter does too. */
function lowercaseKeys(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}
