import { describe, expect, it } from "vitest";
import {
  Container,
  HttpContext,
  HttpPipeline,
  HttpResponse,
  RouteHandler,
} from "../../src/index.js";

class Tracked {
  static disposed: number[] = [];
  static created = 0;

  readonly id = ++Tracked.created;

  dispose(): void {
    Tracked.disposed.push(this.id);
  }
}

function createRoot(): Container {
  const services = new Container();

  services.registerScoped("request", () => new Tracked());
  services.registerSingleton("shared", () => ({ shared: true }));

  return services;
}

interface TestResponse {
  statusCode: number;
  sent: boolean;
  status(code: number): TestResponse;
  header(): TestResponse;
  json(): void;
  end(): void;
}

function createContext(services: Container): HttpContext {
  const response: TestResponse = {
    statusCode: 200,
    sent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    header() {
      return this;
    },
    json() {
      this.sent = true;
    },
    end() {
      this.sent = true;
    },
  };

  return {
    request: {
      method: "GET",
      path: "/",
      params: {},
      query: {},
      headers: {},
      body: undefined,
    },
    response: response as unknown as HttpResponse,
    services,
  };
}

describe("Request scope", () => {
  it("shares scoped services between middleware and handler of one request", async () => {
    Tracked.disposed = [];
    const root = createRoot();
    const seen: unknown[] = [];

    const handler: RouteHandler = (context) => {
      seen.push(context.services.get("request"));
      return { ok: true };
    };

    await new HttpPipeline().execute(
      createContext(root),
      [
        {
          execute: async (context, next) => {
            seen.push(context.services.get("request"));
            await next();
          },
        },
      ],
      handler,
    );

    expect(seen[0]).toBe(seen[1]);
  });

  it("creates a different scoped instance for each request", async () => {
    Tracked.disposed = [];
    const root = createRoot();
    const ids: number[] = [];

    const handler: RouteHandler = (context) => {
      ids.push((context.services.get("request") as Tracked).id);
      return null;
    };

    const pipeline = new HttpPipeline();
    await pipeline.execute(createContext(root), [], handler);
    await pipeline.execute(createContext(root), [], handler);

    expect(ids[0]).not.toBe(ids[1]);
  });

  it("shares singletons across requests", async () => {
    const root = createRoot();
    const values: unknown[] = [];

    const handler: RouteHandler = (context) => {
      values.push(context.services.get("shared"));
      return null;
    };

    const pipeline = new HttpPipeline();
    await pipeline.execute(createContext(root), [], handler);
    await pipeline.execute(createContext(root), [], handler);

    expect(values[0]).toBe(values[1]);
  });

  it("disposes scoped services when the request finishes", async () => {
    Tracked.disposed = [];
    const root = createRoot();

    const handler: RouteHandler = (context) => {
      context.services.get("request");
      return { ok: true };
    };

    await new HttpPipeline().execute(createContext(root), [], handler);

    expect(Tracked.disposed).toHaveLength(1);
  });

  it("disposes scoped services even when the handler throws", async () => {
    Tracked.disposed = [];
    const root = createRoot();

    const handler: RouteHandler = (context) => {
      context.services.get("request");
      throw new Error("boom");
    };

    await expect(
      new HttpPipeline().execute(createContext(root), [], handler),
    ).rejects.toThrow("boom");

    expect(Tracked.disposed).toHaveLength(1);
  });
});
