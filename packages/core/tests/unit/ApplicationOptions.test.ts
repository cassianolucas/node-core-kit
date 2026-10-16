import { describe, expect, it, vi } from "vitest";
import { Application, HttpAdapter } from "../../src/index.js";

function createAdapter() {
  const register = vi.fn();
  const listen = vi.fn(async () => {});
  const close = vi.fn(async () => {});
  const http = { register, listen, close } as unknown as HttpAdapter;

  return { http, register, listen, close };
}

describe("Application options", () => {
  it("binds to 127.0.0.1 by default", async () => {
    const { http, listen } = createAdapter();
    const app = new Application({ http });

    await app.start();

    expect(listen).toHaveBeenCalledWith({ port: 3000, host: "127.0.0.1" });
    await app.stop();
  });

  it("uses the configured host, port, body limit and timeouts", async () => {
    const { http, register, listen } = createAdapter();
    const app = new Application({
      http,
      port: 8080,
      host: "0.0.0.0",
      bodyLimit: 512,
      requestTimeoutMs: 5_000,
    });

    await app.start();

    expect(listen).toHaveBeenCalledWith({ port: 8080, host: "0.0.0.0" });
    expect(register.mock.calls[0]?.[3]).toEqual({
      bodyLimit: 512,
      requestTimeoutMs: 5_000,
    });
    await app.stop();
  });

  it("rejects invalid ports", () => {
    const { http } = createAdapter();

    expect(() => new Application({ http, port: 70_000 })).toThrow(RangeError);
    expect(() => new Application({ http, port: 1.5 })).toThrow(RangeError);
  });

  it("rejects non-positive limits and timeouts", () => {
    const { http } = createAdapter();

    expect(() => new Application({ http, bodyLimit: 0 })).toThrow("bodyLimit");
    expect(() => new Application({ http, shutdownTimeoutMs: -1 })).toThrow(
      "shutdownTimeoutMs",
    );
  });

  it("passes the shutdown timeout to the adapter when stopping", async () => {
    const { http, close } = createAdapter();
    const app = new Application({ http, shutdownTimeoutMs: 1_500 });

    await app.start();
    await app.stop();

    expect(close).toHaveBeenCalledWith({ timeoutMs: 1_500 });
  });
});

describe("Application.run", () => {
  it("starts, waits for a shutdown signal, then stops and disposes", async () => {
    const { http, listen, close } = createAdapter();
    const app = new Application({ http });

    const running = app.run();
    await vi.waitFor(() => expect(listen).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(process.listenerCount("SIGTERM")).toBeGreaterThan(0),
    );

    process.emit("SIGTERM");
    await running;

    expect(close).toHaveBeenCalledTimes(1);
  });
});
