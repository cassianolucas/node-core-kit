import { describe, expect, it, vi } from "vitest";
import {
  HttpMiddleware,
  RouteDefinition,
  RouteGroup,
  RouteRegistry,
} from "../../src/index.js";

function createRoot() {
  const routes: RouteDefinition[] = [];

  const root: RouteRegistry = {
    getPrefix: () => "",
    getMiddlewares: () => [],
    registerRoute: (route) => {
      routes.push(route);
    },
    mapGet: () => root,
    mapPost: () => root,
    mapPut: () => root,
    mapPatch: () => root,
    mapDelete: () => root,
    group: (prefix) => new RouteGroup(prefix, root),
    use: () => root,
  };

  return { root, routes };
}

describe("RouteGroup", () => {
  it("combines nested prefixes", () => {
    const { root, routes } = createRoot();

    const api = new RouteGroup("/api", root);
    const v1 = api.group("/v1");
    const users = v1.group("/users");

    users.mapGet("/:id", () => ({ ok: true }));

    expect(routes).toHaveLength(1);
    expect(routes[0]?.path).toBe("/api/v1/users/:id");
  });

  it("inherits group middlewares", () => {
    const { root, routes } = createRoot();

    const middleware = {
      execute: vi.fn(),
    } satisfies HttpMiddleware;

    const api = new RouteGroup("/api", root);
    const users = api.group("/users");

    api.use(middleware);

    users.mapGet("/", () => ({ ok: true }));

    expect(routes[0]?.middlewares).toContain(middleware);
  });
});
