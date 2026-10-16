import { afterEach, describe, expect, it } from "vitest";
import {
  AppError,
  Application,
  HttpAdapter,
  HttpContext,
  Results,
  ValidationError,
} from "@cassianolucas/node-core-kit";

interface Running {
  app: Application;
  baseUrl: string;
}

/**
 * Behavior every HTTP adapter must provide. Each adapter's test file calls
 * `runHttpAdapterContract` with a factory that returns a fresh adapter.
 */
export function runHttpAdapterContract(
  adapterName: string,
  createAdapter: () => HttpAdapter,
): void {
  describe(`${adapterName} - HTTP adapter contract`, () => {
    const running: Application[] = [];

    afterEach(async () => {
      for (const app of running.splice(0)) {
        await app.stop();
      }
    });

    async function start(
      configure: (app: Application) => void,
      options: {
        bodyLimit?: number;
        requestTimeoutMs?: number;
        shutdownTimeoutMs?: number;
      } = {},
    ): Promise<Running> {
      const app = new Application({
        http: createAdapter(),
        port: 0,
        host: "127.0.0.1",
        ...options,
      });

      configure(app);
      await app.start();
      running.push(app);

      return { app, baseUrl: `http://127.0.0.1:${app.listeningPort}` };
    }

    it("binds to a free port when the configured port is 0", async () => {
      const { app } = await start(() => {});

      expect(app.listeningPort).toBeGreaterThan(0);
    });

    it("passes route parameters and query strings to handlers", async () => {
      const { baseUrl } = await start((app) => {
        app.mapGet("/users/:id", (context) => ({
          id: context.request.params.id,
          tag: context.request.query.tag,
          path: context.request.path,
        }));
      });

      const response = await fetch(`${baseUrl}/users/42?tag=admin`);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id: "42",
        tag: "admin",
        path: "/users/42",
      });
    });

    it("parses JSON bodies and applies result headers", async () => {
      const { baseUrl } = await start((app) => {
        app.mapPost("/users", (context) =>
          Results.created("/users/1", context.request.body),
        );
      });

      const response = await fetch(`${baseUrl}/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Ada" }),
      });

      expect(response.status).toBe(201);
      expect(response.headers.get("location")).toBe("/users/1");
      expect(await response.json()).toEqual({ name: "Ada" });
    });

    it("returns an empty 204 response from Results.noContent", async () => {
      const { baseUrl } = await start((app) => {
        app.mapDelete("/users/:id", () => Results.noContent());
      });

      const response = await fetch(`${baseUrl}/users/1`, { method: "DELETE" });

      expect(response.status).toBe(204);
      expect(await response.text()).toBe("");
    });

    it("answers unknown routes with a Problem Details 404", async () => {
      const { baseUrl } = await start(() => {});

      const response = await fetch(`${baseUrl}/missing`);

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain(
        "application/problem+json",
      );
      expect(await response.json()).toMatchObject({
        status: 404,
        code: "NOT_FOUND",
        instance: "/missing",
      });
    });

    it("rejects bodies larger than the configured limit with 413", async () => {
      const { baseUrl } = await start(
        (app) => {
          app.mapPost("/upload", () => ({ ok: true }));
        },
        { bodyLimit: 64 },
      );

      const response = await fetch(`${baseUrl}/upload`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "x".repeat(200) }),
      });

      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({
        status: 413,
        code: "PAYLOAD_TOO_LARGE",
      });
    });

    it("rejects malformed JSON with a Problem Details 400", async () => {
      const { baseUrl } = await start((app) => {
        app.mapPost("/users", (context) => context.request.body);
      });

      const response = await fetch(`${baseUrl}/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ not json",
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ status: 400 });
    });

    it("hides the details of unexpected errors", async () => {
      const { baseUrl } = await start((app) => {
        app.mapGet("/boom", () => {
          throw new Error("database password is secret");
        });
      });

      const response = await fetch(`${baseUrl}/boom`);
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(text).not.toContain("secret");
      expect(JSON.parse(text)).toMatchObject({ status: 500 });
    });

    it("runs global middleware, filters and handlers in the same order", async () => {
      const order: string[] = [];

      const { baseUrl } = await start((app) => {
        app.use({
          async execute(context: HttpContext, next) {
            order.push("middleware");
            context.response.header("x-trace", "on");
            await next();
          },
        });
        app.useFilter(async (_context, next) => {
          order.push("filter");
          return next();
        });
        app.mapGet("/ordered", () => {
          order.push("handler");
          return { ok: true };
        });
      });

      const response = await fetch(`${baseUrl}/ordered`);

      expect(response.headers.get("x-trace")).toBe("on");
      expect(order).toEqual(["middleware", "filter", "handler"]);
    });

    it("lets in-flight requests finish when the application stops", async () => {
      const { app, baseUrl } = await start(
        (app) => {
          app.mapGet("/slow", async () => {
            await new Promise((resolve) => setTimeout(resolve, 300));
            return { done: true };
          });
        },
        { shutdownTimeoutMs: 5_000 },
      );

      const pending = fetch(`${baseUrl}/slow`);
      await new Promise((resolve) => setTimeout(resolve, 50));

      await app.stop();

      const response = await pending;
      expect(await response.json()).toEqual({ done: true });
    });

    it("closes requests that exceed the shutdown timeout", async () => {
      const { app, baseUrl } = await start(
        (app) => {
          app.mapGet("/stuck", () => new Promise(() => {}));
        },
        { shutdownTimeoutMs: 200 },
      );

      const pending = fetch(`${baseUrl}/stuck`).catch(
        (error: unknown) => error,
      );
      await new Promise((resolve) => setTimeout(resolve, 50));

      const startedAt = Date.now();
      await app.stop();

      expect(Date.now() - startedAt).toBeLessThan(3_000);
      expect(await pending).toBeInstanceOf(Error);
    });

    it("keeps AppError responses consistent with thrown errors", async () => {
      const { baseUrl } = await start((app) => {
        app.mapGet("/conflict", () => {
          throw new AppError("Already exists.", "CONFLICT", 409);
        });
      });

      const response = await fetch(`${baseUrl}/conflict`);

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        status: 409,
        detail: "Already exists.",
        code: "CONFLICT",
      });
    });

    it("validates the body with a model binding before the handler runs", async () => {
      const parseUser = (input: unknown) => {
        const name = (input as { name?: unknown } | undefined)?.name;

        if (typeof name !== "string" || name.length === 0) {
          throw new ValidationError("Name is required.");
        }

        return { name };
      };

      const { baseUrl } = await start((app) => {
        app.mapPost("/users", { body: parseUser }, (context) => ({
          name: context.body.name,
        }));
      });

      const invalid = await fetch(`${baseUrl}/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({
        code: "VALIDATION_ERROR",
        detail: "Name is required.",
      });

      const valid = await fetch(`${baseUrl}/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Ada" }),
      });

      expect(await valid.json()).toEqual({ name: "Ada" });
    });

    it("creates a new scoped service instance for each request", async () => {
      const { baseUrl } = await start((app) => {
        app.services.registerScoped("request-id", () => ({
          id: Math.random().toString(36).slice(2),
        }));

        app.mapGet("/scoped", (context) => ({
          id: (context.services.get("request-id") as { id: string }).id,
        }));
      });

      const first = (await (await fetch(`${baseUrl}/scoped`)).json()) as {
        id: string;
      };
      const second = (await (await fetch(`${baseUrl}/scoped`)).json()) as {
        id: string;
      };

      expect(first.id).not.toBe(second.id);
    });

    it("lets an exception handler write the response over HTTP", async () => {
      const { baseUrl } = await start((app) => {
        app.addExceptionHandler({
          tryHandle(context, error) {
            if (!(error instanceof Error) || error.message !== "gone") {
              return false;
            }

            context.response.status(410).json({ custom: true });
            return true;
          },
        });

        app.mapGet("/old", () => {
          throw new Error("gone");
        });
      });

      const response = await fetch(`${baseUrl}/old`);

      expect(response.status).toBe(410);
      expect(await response.json()).toEqual({ custom: true });
    });

    it("passes an empty JSON body as undefined and other bodies as text", async () => {
      const { baseUrl } = await start((app) => {
        app.mapPost("/echo", (context) => ({
          body: context.request.body ?? null,
          type: typeof context.request.body,
        }));
      });

      const empty = await fetch(`${baseUrl}/echo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      expect(await empty.json()).toEqual({ body: null, type: "undefined" });

      const text = await fetch(`${baseUrl}/echo`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "hello",
      });
      expect(await text.json()).toEqual({ body: "hello", type: "string" });
    });

    it("rejects an invalid JSON body with the same Problem Details 400", async () => {
      const { baseUrl } = await start((app) => {
        app.mapPost("/json", () => ({ ok: true }));
      });

      const response = await fetch(`${baseUrl}/json`, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: "{",
      });

      expect(response.status).toBe(400);
      expect(response.headers.get("content-type")).toContain(
        "application/problem+json",
      );
      expect(await response.json()).toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects startup when the port is already in use", async () => {
      const { app: first } = await start(() => {});
      const port = first.listeningPort as number;

      const second = new Application({
        http: createAdapter(),
        port,
        host: "127.0.0.1",
      });

      await expect(second.start()).rejects.toThrow();
      expect(second.listeningPort).toBeUndefined();
    });

    it("keeps a custom content type set by the handler", async () => {
      const { baseUrl } = await start((app) => {
        app.mapGet("/csv", () =>
          Results.json("a,b", 200, { "content-type": "text/csv" }),
        );
      });

      const response = await fetch(`${baseUrl}/csv`);

      expect(response.headers.get("content-type")).toContain("text/csv");
      expect(await response.text()).toBe('"a,b"');
    });
  });
}
