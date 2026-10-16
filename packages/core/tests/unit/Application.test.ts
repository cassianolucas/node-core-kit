import { describe, expect, it, vi } from "vitest";
import { Application, HttpAdapter, RouteDefinition } from "../../src/index.js";

function createApplication() {
  const register = vi.fn();
  const listen = vi.fn(async () => {});
  const close = vi.fn(async () => {});

  const http = {
    register,
    listen,
    close,
  } as unknown as HttpAdapter;

  const app = new Application({ http });

  return { app, register, listen, close };
}

describe("Application - route registration", () => {
  it("rejects duplicate routes with the same method and path", () => {
    const { app } = createApplication();

    app.mapGet("/users", () => ({ users: [] }));

    expect(() => {
      app.mapGet("/users", () => ({ other: true }));
    }).toThrow("Duplicate route: GET /users.");
  });

  it("allows different HTTP methods on the same path", () => {
    const { app } = createApplication();

    expect(() => {
      app.mapGet("/users", () => ({ users: [] }));
      app.mapPost("/users", () => ({ created: true }));
    }).not.toThrow();
  });

  it("detects duplicate routes registered through groups with the same prefix", () => {
    const { app } = createApplication();

    app.group("/api").mapGet("/users", () => ({ source: 1 }));

    expect(() => {
      app.group("/api").mapGet("/users", () => ({ source: 2 }));
    }).toThrow("Duplicate route: GET /api/users.");
  });

  it("treats paths with trailing slashes as equivalent", () => {
    const { app } = createApplication();

    app.mapGet("/users/", () => ({ users: [] }));

    expect(() => {
      app.mapGet("/users", () => ({ other: true }));
    }).toThrow("Duplicate route: GET /users.");
  });

  it("preserves the original route after a duplicate registration attempt", async () => {
    const { app, register } = createApplication();
    const originalHandler = vi.fn();

    app.mapGet("/users", originalHandler);

    expect(() => {
      app.mapGet("/users", vi.fn());
    }).toThrow("Duplicate route: GET /users.");

    await app.start();

    const registeredRoutes = register.mock.calls[0]?.[0] as
      RouteDefinition[] | undefined;

    expect(registeredRoutes).toHaveLength(1);
    expect(registeredRoutes?.[0]?.path).toBe("/users");
    expect(registeredRoutes?.[0]?.handler).toBe(originalHandler);

    await app.stop();
  });
});

describe("Application - lifecycle", () => {
  it("registers routes and starts the HTTP adapter", async () => {
    const { app, register, listen } = createApplication();

    app.mapGet("/health", () => ({ status: "ok" }));

    await app.start();

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          method: "GET",
          path: "/health",
        }),
      ]),
      app.services,
      expect.any(Array),
      { bodyLimit: 1024 * 1024, requestTimeoutMs: 30_000 },
    );

    expect(listen).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith({ port: 3000, host: "127.0.0.1" });

    await app.stop();
  });

  it("rejects starting an already running application", async () => {
    const { app, register, listen } = createApplication();

    await app.start();

    await expect(app.start()).rejects.toThrow("already started");

    expect(register).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledTimes(1);

    await app.stop();
  });

  it("does nothing when stopping an application that has not started", async () => {
    const { app, close } = createApplication();

    await app.stop();

    expect(close).not.toHaveBeenCalled();
  });

  it("closes the HTTP adapter when stopping a running application", async () => {
    const { app, close } = createApplication();

    await app.start();
    await app.stop();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("rejects starting again after the application has stopped", async () => {
    const { app, register, listen, close } = createApplication();

    await app.start();
    await app.stop();

    await expect(app.start()).rejects.toThrow("cannot be restarted");

    expect(register).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("allows retrying startup when the HTTP adapter fails to listen", async () => {
    const { app, listen } = createApplication();

    listen.mockRejectedValueOnce(new Error("HTTP server startup failed"));

    await expect(app.start()).rejects.toThrow("HTTP server startup failed");

    await expect(app.start()).resolves.toBeUndefined();

    await app.stop();
  });
});
