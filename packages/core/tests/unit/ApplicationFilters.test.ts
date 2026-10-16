import { describe, expect, it, vi } from "vitest";
import {
  Application,
  HttpAdapter,
  HttpContext,
  RouteDefinition,
} from "../../src/index.js";

function createApplication() {
  const register = vi.fn();

  const http = {
    register,
    listen: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  } as unknown as HttpAdapter;

  return { app: new Application({ http }), register };
}

describe("Application - filters", () => {
  it("runs global filters before every route handler", async () => {
    const { app, register } = createApplication();
    const calls: string[] = [];

    app.useFilter(async (_, next) => {
      calls.push("global");
      return next();
    });
    app.mapGet("/items", () => {
      calls.push("handler");
      return [];
    });

    await app.start();

    const [routes] = register.mock.calls[0] as [RouteDefinition[]];
    await routes[0]?.handler({} as HttpContext);

    expect(calls).toEqual(["global", "handler"]);
  });

  it("rejects adding filters after startup has begun", async () => {
    const { app } = createApplication();

    await app.start();

    expect(() => app.useFilter(() => null)).toThrow(
      "configuration cannot be changed",
    );
  });

  it("runs global filters before group filters, and group filters before the handler", async () => {
    const { app, register } = createApplication();
    const calls: string[] = [];

    app.useFilter(async (_, next) => {
      calls.push("global");
      return next();
    });
    app
      .group("/api")
      .useFilter(async (_, next) => {
        calls.push("group");
        return next();
      })
      .mapGet("/items", () => {
        calls.push("handler");
        return [];
      });

    await app.start();

    const [routes] = register.mock.calls[0] as [RouteDefinition[]];
    await routes[0]?.handler({} as HttpContext);

    expect(routes[0]?.path).toBe("/api/items");
    expect(calls).toEqual(["global", "group", "handler"]);
  });

  it("does not apply a group filter to routes outside the group", async () => {
    const { app, register } = createApplication();
    const calls: string[] = [];

    app.group("/api").useFilter(async (_, next) => {
      calls.push("group");
      return next();
    });
    app.mapGet("/health", () => ({ ok: true }));

    await app.start();

    const [routes] = register.mock.calls[0] as [RouteDefinition[]];
    await routes[0]?.handler({} as HttpContext);

    expect(calls).toEqual([]);
  });
});
