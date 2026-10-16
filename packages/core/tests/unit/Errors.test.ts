import { describe, expect, it } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../src/index.js";

describe("error classes", () => {
  it("have default messages, codes and status codes", () => {
    expect(new ValidationError()).toMatchObject({
      message: "The provided data is invalid.",
      code: "VALIDATION_ERROR",
      statusCode: 400,
    });
    expect(new UnauthorizedError()).toMatchObject({
      message: "Authentication required.",
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
    expect(new ForbiddenError()).toMatchObject({
      message: "Access denied.",
      code: "FORBIDDEN",
      statusCode: 403,
    });
    expect(new NotFoundError()).toMatchObject({
      message: "Resource not found.",
      code: "NOT_FOUND",
      statusCode: 404,
    });
    expect(new ConflictError()).toMatchObject({
      message: "The operation conflicts with the current state.",
      code: "CONFLICT",
      statusCode: 409,
    });
  });

  it("keep the class name for logging and type checks", () => {
    expect(new NotFoundError().name).toBe("NotFoundError");
    expect(new NotFoundError()).toBeInstanceOf(Error);
  });
});
