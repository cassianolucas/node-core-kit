import { describe, expect, it } from "vitest";
import {
  Application,
  HttpContext,
  HttpMiddleware,
  Results,
  ValidationError,
} from "../../src/index.js";
import { TestHttpAdapter } from "../../src/testing/index.js";

async function startApp(configure: (app: Application) => void) {
  const http = new TestHttpAdapter();
  const app = new Application({ http });

  configure(app);
  await app.start();

  return { app, http };
}

describe("TestHttpAdapter", () => {
  it("refuses requests before the application has started", async () => {
    const http = new TestHttpAdapter();

    await expect(http.request("GET", "/")).rejects.toThrow(
      "Call app.start() before sending test requests.",
    );
  });

  it("runs a matched route with parameters, query, headers and body", async () => {
    const { http } = await startApp((app) => {
      app.mapPost("/users/:id", (context) => ({
        id: context.request.params.id,
        tags: context.request.query.tag,
        auth: context.request.headers.authorization,
        body: context.request.body,
      }));
    });

    const response = await http.request("POST", "/users/7?tag=a&tag=b", {
      body: { name: "Ada" },
      headers: { Authorization: "token" },
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: "7",
      tags: ["a", "b"],
      auth: "token",
      body: { name: "Ada" },
    });
  });

  it("answers an unknown route with a Problem Details 404", async () => {
    const { http } = await startApp(() => {});

    const response = await http.request("GET", "/missing");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toBe("application/problem+json");
    expect(response.body).toMatchObject({ status: 404, instance: "/missing" });
  });

  it("returns a 204 response when the handler returns nothing", async () => {
    const { http } = await startApp((app) => {
      app.mapDelete("/items/:id", () => undefined);
    });

    const response = await http.request("DELETE", "/items/1");

    expect(response.status).toBe(204);
    expect(response.body).toBeUndefined();
  });

  it("applies global and route middleware, and lowercases response headers", async () => {
    const order: string[] = [];
    const global: HttpMiddleware = {
      async execute(context: HttpContext, next) {
        order.push("global");
        context.response.header("X-Trace", "on");
        await next();
      },
    };
    const local: HttpMiddleware = {
      async execute(_context, next) {
        order.push("local");
        await next();
      },
    };

    const { http, app } = await startApp((app) => {
      app.use(global);
      app
        .group("/api")
        .use(local)
        .mapGet("/ping", () => Results.ok({ pong: true }));
    });

    const response = await http.request("GET", "/api/ping");

    expect(response.headers["x-trace"]).toBe("on");
    expect(order).toEqual(["global", "local"]);
    expect(response.body).toEqual({ pong: true });
    expect(app.listeningPort).toBeUndefined();
  });

  it("converts thrown validation errors into Problem Details responses", async () => {
    const { http } = await startApp((app) => {
      app.mapGet("/fail", () => {
        throw new ValidationError("Bad input.");
      });
    });

    const response = await http.request("GET", "/fail");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      detail: "Bad input.",
      code: "VALIDATION_ERROR",
    });
  });
});
