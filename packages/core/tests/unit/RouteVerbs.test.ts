import { describe, expect, it, vi } from "vitest";
import {
  Application,
  HttpAdapter,
  HttpContext,
  RouteDefinition,
} from "../../src/index.js";

async function registeredRoutes(configure: (app: Application) => void) {
  const register = vi.fn();
  const http = {
    register,
    listen: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  } as unknown as HttpAdapter;
  const app = new Application({ http });

  configure(app);
  await app.start();

  const [routes] = register.mock.calls[0] as [RouteDefinition[]];

  return routes;
}

describe("route verbs", () => {
  it("registers every verb on the application", async () => {
    const routes = await registeredRoutes((app) => {
      app.mapGet("/r", () => null);
      app.mapPost("/r", () => null);
      app.mapPut("/r", () => null);
      app.mapPatch("/r", () => null);
      app.mapDelete("/r", () => null);
    });

    expect(routes.map((route) => route.method)).toEqual([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
    ]);
  });

  it("registers every verb inside a group, with the group prefix", async () => {
    const routes = await registeredRoutes((app) => {
      const group = app.group("/api");

      group.mapGet("/r", () => null);
      group.mapPost("/r", () => null);
      group.mapPut("/r", () => null);
      group.mapPatch("/r", () => null);
      group.mapDelete("/r", () => null);
    });

    expect(routes.map((route) => `${route.method} ${route.path}`)).toEqual([
      "GET /api/r",
      "POST /api/r",
      "PUT /api/r",
      "PATCH /api/r",
      "DELETE /api/r",
    ]);
  });

  it("accepts a model binding for group routes", async () => {
    const routes = await registeredRoutes((app) => {
      app
        .group("/api")
        .mapPut(
          "/items/:id",
          { body: (input: unknown) => input as { qty: number } },
          (context) => ({
            qty: context.body.qty,
            id: context.request.params.id,
          }),
        );
    });

    await expect(
      routes[0]?.handler({
        request: {
          params: { id: "3" },
          body: { qty: 2 },
          query: {},
          headers: {},
        },
      } as unknown as HttpContext),
    ).resolves.toEqual({ qty: 2, id: "3" });
  });
});
