import { describe, expect, it, vi } from "vitest";
import {
  Container,
  ErrorHandlerMiddleware,
  HttpContext,
  NotFoundError,
  ValidationError,
} from "../../src/index.js";

function createContext() {
  let statusCode = 200;
  let sent = false;
  let body: unknown;

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
  };
}

describe("ErrorHandlerMiddleware", () => {
  it("converts NotFoundError to HTTP 404", async () => {
    const middleware = new ErrorHandlerMiddleware();
    const result = createContext();

    await middleware.execute(result.context, async () => {
      throw new NotFoundError("User not found.");
    });

    expect(result.getStatus()).toBe(404);
    expect(result.getBody()).toEqual({
      error: "NOT_FOUND",
      message: "User not found.",
    });
  });

  it("converts ValidationError to HTTP 400", async () => {
    const middleware = new ErrorHandlerMiddleware();
    const result = createContext();

    await middleware.execute(result.context, async () => {
      throw new ValidationError("Name is required.");
    });

    expect(result.getStatus()).toBe(400);
    expect(result.getBody()).toEqual({
      error: "VALIDATION_ERROR",
      message: "Name is required.",
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
        error: "INTERNAL_SERVER_ERROR",
        message: "An internal error occurred.",
      });
      expect(JSON.stringify(result.getBody())).not.toContain("secret");
      expect(logger).toHaveBeenCalledOnce();
    } finally {
      logger.mockRestore();
    }
  });
});
