import { describe, expect, it, vi } from "vitest";
import {
  Application,
  Container,
  HttpAdapter,
  HttpContext,
  ModelParser,
  RouteDefinition,
  ValidationError,
} from "../../src/index.js";

type CreateUser = { name: string };

// A hand-written parser, no validation library involved.
const parseCreateUser = (input: unknown): CreateUser => {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof (input as { name?: unknown }).name !== "string"
  ) {
    throw new ValidationError("Name is required.");
  }

  return input as CreateUser;
};

function createContext(
  overrides: Partial<HttpContext["request"]> = {},
): HttpContext {
  return {
    request: {
      method: "POST",
      path: "/users",
      params: {},
      query: {},
      headers: {},
      body: undefined,
      ...overrides,
    },
    response: {} as HttpContext["response"],
    services: new Container(),
  };
}

function createApplication() {
  const register = vi.fn();
  const http = {
    register,
    listen: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  } as unknown as HttpAdapter;

  return { app: new Application({ http }), register };
}

async function routeHandler(register: ReturnType<typeof vi.fn>, index = 0) {
  const [routes] = register.mock.calls[0] as [RouteDefinition[]];
  const route = routes[index];

  if (!route) {
    throw new Error("route not registered");
  }

  return route.handler;
}

describe("Model binding", () => {
  it("passes the parsed body to the handler with its inferred type", async () => {
    const { app, register } = createApplication();

    app.mapPost("/users", { body: parseCreateUser }, (context) => ({
      name: context.body.name,
    }));

    await app.start();

    const handler = await routeHandler(register);
    const result = await handler(createContext({ body: { name: "Ada" } }));

    expect(result).toEqual({ name: "Ada" });
  });

  it("accepts a parser object with a parse method", async () => {
    const { app, register } = createApplication();
    const parser: ModelParser<CreateUser> = {
      parse: (input) => parseCreateUser(input),
    };

    app.mapPost("/users", { body: parser }, (context) => context.body);

    await app.start();

    const handler = await routeHandler(register);

    await expect(
      handler(createContext({ body: { name: "Ada" } })),
    ).resolves.toEqual({
      name: "Ada",
    });
  });

  it("returns a generic validation error for an invalid body", async () => {
    const { app, register } = createApplication();

    app.mapPost("/users", { body: parseCreateUser }, () => "unreachable");

    await app.start();

    const handler = await routeHandler(register);

    await expect(handler(createContext({ body: {} }))).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("keeps the message of a ValidationError thrown by the parser", async () => {
    const { app, register } = createApplication();

    app.mapPost("/users", { body: parseCreateUser }, () => "unreachable");

    await app.start();

    const handler = await routeHandler(register);

    await expect(handler(createContext({ body: {} }))).rejects.toThrow(
      "Name is required.",
    );
  });

  it("hides the message of unexpected parser errors", async () => {
    const { app, register } = createApplication();
    const parser = () => {
      throw new Error("database password is secret");
    };

    app.mapPost("/users", { body: parser }, () => "unreachable");

    await app.start();

    const handler = await routeHandler(register);

    let error: unknown;

    try {
      await handler(createContext({ body: {} }));
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toBe("Invalid request body.");
  });

  it("binds the query string through a query parser", async () => {
    const { app, register } = createApplication();
    const parseSearch = (input: unknown) => {
      const page = Number((input as { page?: unknown }).page);

      if (!Number.isInteger(page)) {
        throw new Error("bad page");
      }

      return { page };
    };

    app.mapGet("/items", { query: parseSearch }, (context) => context.query);

    await app.start();

    const handler = await routeHandler(register);

    await expect(
      handler(createContext({ query: { page: "2" } })),
    ).resolves.toEqual({
      page: 2,
    });
    await expect(
      handler(createContext({ query: { page: "x" } })),
    ).rejects.toThrow("Invalid query parameters.");
  });

  it("still accepts a plain handler without a binding", async () => {
    const { app, register } = createApplication();

    app.mapGet("/health", () => ({ status: "ok" }));

    await app.start();

    const handler = await routeHandler(register);

    expect(await handler(createContext())).toEqual({ status: "ok" });
  });

  it("applies bindings inside route groups", async () => {
    const { app, register } = createApplication();

    app
      .group("/api")
      .mapPost("/users", { body: parseCreateUser }, (context) => context.body);

    await app.start();

    const [routes] = register.mock.calls[0] as [RouteDefinition[]];

    expect(routes[0]?.path).toBe("/api/users");
    await expect(
      routes[0]?.handler(createContext({ body: { name: "Ada" } })),
    ).resolves.toEqual({ name: "Ada" });
  });
});
