import { describe, expect, it, vi } from "vitest";
import {
  Application,
  Container,
  ErrorHandlerMiddleware,
  ExceptionHandler,
  HttpAdapter,
  HttpContext,
  NotFoundError,
  RouteDefinition,
  ValidationError,
} from "../../src/index.js";

function createContext() {
  let statusCode = 200;
  let sent = false;
  let body: unknown;
  const headers: Record<string, string> = {};

  const response = {
    get statusCode() {
      return statusCode;
    },

    get sent() {
      return sent;
    },

    status(code: number) {
      statusCode = code;
      return this;
    },

    header(name: string, value: string) {
      headers[name] = value;
      return this;
    },

    json(data: unknown) {
      body = data;
      sent = true;
    },

    end() {
      sent = true;
    },
  };

  const context = {
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
  } as HttpContext;

  return {
    context,
    getStatus: () => statusCode,
    getBody: () => body,
    getHeaders: () => headers,
  };
}

describe("ErrorHandlerMiddleware", () => {
  it("converts NotFoundError to an RFC 7807 problem response", async () => {
    const middleware = new ErrorHandlerMiddleware();
    const result = createContext();

    await middleware.execute(result.context, async () => {
      throw new NotFoundError("User not found.");
    });

    expect(result.getStatus()).toBe(404);
    expect(result.getHeaders()["content-type"]).toBe(
      "application/problem+json",
    );
    expect(result.getBody()).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "User not found.",
      instance: "/test",
      code: "NOT_FOUND",
    });
  });

  it("converts ValidationError to HTTP 400", async () => {
    const middleware = new ErrorHandlerMiddleware();
    const result = createContext();

    await middleware.execute(result.context, async () => {
      throw new ValidationError("Name is required.");
    });

    expect(result.getStatus()).toBe(400);
    expect(result.getBody()).toMatchObject({
      status: 400,
      title: "Bad Request",
      detail: "Name is required.",
      code: "VALIDATION_ERROR",
    });
  });

  it("does not expose unexpected error details", async () => {
    const middleware = new ErrorHandlerMiddleware();
    const result = createContext();
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await middleware.execute(result.context, async () => {
        throw new Error("Database password: secret");
      });

      expect(result.getStatus()).toBe(500);
      expect(result.getBody()).toEqual({
        type: "about:blank",
        title: "Internal Server Error",
        status: 500,
        detail: "An internal error occurred.",
        instance: "/test",
        code: "INTERNAL_SERVER_ERROR",
      });
      expect(JSON.stringify(result.getBody())).not.toContain("secret");
      expect(logger).toHaveBeenCalledOnce();
    } finally {
      logger.mockRestore();
    }
  });

  it("lets an exception handler take over the response", async () => {
    const handler: ExceptionHandler = {
      tryHandle(context, error) {
        if (!(error instanceof NotFoundError)) {
          return false;
        }

        context.response.status(410).json({ gone: true });
        return true;
      },
    };
    const middleware = new ErrorHandlerMiddleware([handler]);
    const result = createContext();

    await middleware.execute(result.context, async () => {
      throw new NotFoundError();
    });

    expect(result.getStatus()).toBe(410);
    expect(result.getBody()).toEqual({ gone: true });
  });

  it("tries handlers in order and falls back to the default when none handles the error", async () => {
    const calls: string[] = [];
    const first: ExceptionHandler = {
      tryHandle() {
        calls.push("first");
        return false;
      },
    };
    const second: ExceptionHandler = {
      tryHandle() {
        calls.push("second");
        return false;
      },
    };
    const middleware = new ErrorHandlerMiddleware([first, second]);
    const result = createContext();

    await middleware.execute(result.context, async () => {
      throw new ValidationError("Invalid.");
    });

    expect(calls).toEqual(["first", "second"]);
    expect(result.getStatus()).toBe(400);
  });
});

describe("Application - exception handlers", () => {
  it("registers exception handlers that run before the default handler", async () => {
    const register = vi.fn();
    const http = {
      register,
      listen: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    } as unknown as HttpAdapter;
    const app = new Application({ http });

    app.addExceptionHandler({
      tryHandle(context, error) {
        if (!(error instanceof NotFoundError)) {
          return false;
        }

        context.response.status(404).json({ custom: true });
        return true;
      },
    });
    app.mapGet("/missing", () => {
      throw new NotFoundError();
    });

    await app.start();

    const [routes] = register.mock.calls[0] as [RouteDefinition[]];
    const [, , middlewares] = register.mock.calls[0] as [
      RouteDefinition[],
      Container,
      Array<{
        execute(context: HttpContext, next: () => Promise<void>): Promise<void>;
      }>,
    ];
    const context = createContext().context;

    await middlewares[0]?.execute(context, async () => {
      await routes[0]?.handler(context);
    });

    expect(context.response.sent).toBe(true);
  });

  it("rejects adding exception handlers after startup has begun", async () => {
    const http = {
      register: vi.fn(),
      listen: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    } as unknown as HttpAdapter;
    const app = new Application({ http });

    await app.start();

    expect(() => app.addExceptionHandler({ tryHandle: () => false })).toThrow(
      "configuration cannot be changed",
    );
  });
});
