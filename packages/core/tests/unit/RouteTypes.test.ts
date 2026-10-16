import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  Application,
  EndpointFilter,
  HttpAdapter,
  HttpContext,
  RouteDefinition,
  RouteParams,
} from "../../src/index.js";
import { TestHttpAdapter } from "../../src/testing/index.js";

describe("route parameter types", () => {
  it("infers parameter names from a literal path", () => {
    expectTypeOf<RouteParams<"/users/:id/posts/:postId">>().toEqualTypeOf<{
      readonly id: string;
      readonly postId: string;
    }>();
  });

  it("gives an empty object for a path without parameters", () => {
    expectTypeOf<RouteParams<"/health">>().toEqualTypeOf<{}>();
  });

  it("falls back to a record for a path typed as string", () => {
    expectTypeOf<RouteParams<string>>().toEqualTypeOf<Record<string, string>>();
  });

  it("types context.request.params from the path in map methods", () => {
    const app = new Application({ http: new TestHttpAdapter() });

    app.mapGet("/users/:id", (context) => {
      expectTypeOf(context.request.params.id).toEqualTypeOf<string>();
      return context.request.params.id;
    });
  });
});

describe("route options", () => {
  function createApplication() {
    const register = vi.fn();
    const http = {
      register,
      listen: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    } as unknown as HttpAdapter;

    return { app: new Application({ http }), register };
  }

  it("applies route filters only to that route", async () => {
    const { app, register } = createApplication();
    const calls: string[] = [];
    const filter: EndpointFilter = async (_context, next) => {
      calls.push("route");
      return next();
    };

    app.mapGet("/guarded", () => ({ ok: true }), { filters: [filter] });
    app.mapGet("/open", () => ({ ok: true }));

    await app.start();

    const [routes] = register.mock.calls[0] as [RouteDefinition[]];
    await routes[0]?.handler({} as HttpContext);
    await routes[1]?.handler({} as HttpContext);

    expect(calls).toEqual(["route"]);
  });

  it("runs group filters before route filters", async () => {
    const { app, register } = createApplication();
    const calls: string[] = [];

    app
      .group("/api")
      .useFilter(async (_context, next) => {
        calls.push("group");
        return next();
      })
      .mapPost(
        "/items",
        () => {
          calls.push("handler");
          return null;
        },
        {
          filters: [
            async (_context, next) => {
              calls.push("route");
              return next();
            },
          ],
        },
      );

    await app.start();

    const [routes] = register.mock.calls[0] as [RouteDefinition[]];
    await routes[0]?.handler({} as HttpContext);

    expect(calls).toEqual(["group", "route", "handler"]);
  });

  it("accepts a model binding together with options", async () => {
    const { app, register } = createApplication();
    const parse = (input: unknown) => input as { name: string };

    app.mapPost("/users", { body: parse }, (context) => context.body.name, {
      filters: [],
    });

    await app.start();

    expect(register).toHaveBeenCalledTimes(1);
  });

  it("rejects options that are not an object", () => {
    const { app } = createApplication();

    expect(() =>
      app.mapGet("/x", () => null, "invalid" as unknown as { filters: [] }),
    ).toThrow("Route options must be an object.");
  });
});
