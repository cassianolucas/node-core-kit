import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HttpContext,
  HttpMiddleware,
  HttpResponse,
  RouteHandler,
} from "../../src/index.js";
import { Container, HttpPipeline } from "../../src/index.js";

function createContext() {
  let response: HttpResponse;
  response = {
    statusCode: 200,
    sent: false,
    status: vi.fn(() => response),
    json: vi.fn(),
    end: vi.fn(),
  };

  const context: HttpContext = {
    request: {
      method: "GET",
      path: "/test",
      params: {},
      query: {},
      headers: {},
      body: undefined,
    },
    response,
    services: new Container(),
  };

  return { context, response };
}

describe("HttpPipeline", () => {
  let pipeline: HttpPipeline;

  beforeEach(() => {
    pipeline = new HttpPipeline();
  });

  it("executes middleware in order before the route handler", async () => {
    const { context, response } = createContext();
    const calls: string[] = [];
    const first: HttpMiddleware = {
      execute: async (_context, next) => {
        calls.push("first:before");
        await next();
        calls.push("first:after");
      },
    };
    const second: HttpMiddleware = {
      execute: async (_context, next) => {
        calls.push("second:before");
        await next();
        calls.push("second:after");
      },
    };
    const handler: RouteHandler = () => {
      calls.push("handler");
      return { ok: true };
    };

    await pipeline.execute(context, [first, second], handler);

    expect(calls).toEqual([
      "first:before",
      "second:before",
      "handler",
      "second:after",
      "first:after",
    ]);
    expect(response.json).toHaveBeenCalledWith({ ok: true });
  });

  it("sends a JSON response when the handler returns a value", async () => {
    const { context, response } = createContext();
    const result = { id: 42 };

    await pipeline.execute(context, [], () => result);

    expect(response.json).toHaveBeenCalledOnce();
    expect(response.json).toHaveBeenCalledWith(result);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
  });

  it("returns 204 when the handler returns undefined", async () => {
    const { context, response } = createContext();

    await pipeline.execute(context, [], () => undefined);

    expect(response.status).toHaveBeenCalledWith(204);
    expect(response.end).toHaveBeenCalledOnce();
    expect(response.json).not.toHaveBeenCalled();
  });

  it("does not execute the handler when a middleware has already sent the response", async () => {
    const { context, response } = createContext();
    Object.defineProperty(response, "sent", { value: true });
    const handler = vi.fn(() => ({ ok: true }));

    await pipeline.execute(context, [], handler);

    expect(handler).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  it("does not write a response when middleware sends it before calling next", async () => {
    const { context, response } = createContext();
    const middleware: HttpMiddleware = {
      execute: vi.fn(() => {
        Object.defineProperty(response, "sent", { value: true });
      }),
    };
    const handler = vi.fn(() => ({ ok: true }));

    await pipeline.execute(context, [middleware], handler);

    expect(handler).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
  });

  it("does not overwrite a response sent by the handler", async () => {
    const { context, response } = createContext();
    const handler: RouteHandler = () => {
      Object.defineProperty(response, "sent", { value: true });
      return { ok: true };
    };

    await pipeline.execute(context, [], handler);

    expect(response.json).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
    expect(response.end).not.toHaveBeenCalled();
  });

  it("rejects when next is called more than once", async () => {
    const { context } = createContext();
    const middleware: HttpMiddleware = {
      execute: async (_context, next) => {
        await next();
        await next();
      },
    };

    await expect(
      pipeline.execute(context, [middleware], () => ({ ok: true })),
    ).rejects.toThrow("next() called multiple times");
  });

  it("propagates middleware errors", async () => {
    const { context } = createContext();
    const error = new Error("middleware failed");
    const middleware: HttpMiddleware = {
      execute: () => {
        throw error;
      },
    };

    await expect(
      pipeline.execute(context, [middleware], () => ({ ok: true })),
    ).rejects.toBe(error);
  });

  it("propagates handler errors", async () => {
    const { context } = createContext();
    const error = new Error("handler failed");

    await expect(
      pipeline.execute(context, [], () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
