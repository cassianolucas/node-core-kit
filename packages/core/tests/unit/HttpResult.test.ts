import { describe, expect, it } from "vitest";
import {
  Container,
  HttpContext,
  HttpPipeline,
  HttpResponse,
  Results,
} from "../../src/index.js";

function createResponse() {
  const state = {
    statusCode: 200,
    sent: false,
    ended: false,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
  };

  const response: HttpResponse = {
    get statusCode() {
      return state.statusCode;
    },

    get sent() {
      return state.sent;
    },

    status(code: number) {
      state.statusCode = code;
      return this;
    },

    header(name: string, value: string) {
      state.headers[name] = value;
      return this;
    },

    json(body: unknown) {
      state.body = body;
      state.sent = true;
    },

    end() {
      state.ended = true;
      state.sent = true;
    },
  };

  return { response, state };
}

function createContext(): {
  context: HttpContext;
  state: ReturnType<typeof createResponse>["state"];
} {
  const { response, state } = createResponse();

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

  return { context, state };
}

describe("Results", () => {
  it("ok sends the body with status 200", () => {
    const { response, state } = createResponse();

    Results.ok({ id: 1 }).apply(response);

    expect(state.statusCode).toBe(200);
    expect(state.body).toEqual({ id: 1 });
  });

  it("created sets the location header and the body", () => {
    const { response, state } = createResponse();

    Results.created("/users/1", { id: 1 }).apply(response);

    expect(state.statusCode).toBe(201);
    expect(state.headers.location).toBe("/users/1");
    expect(state.body).toEqual({ id: 1 });
  });

  it("created without a body ends the response", () => {
    const { response, state } = createResponse();

    Results.created("/users/1").apply(response);

    expect(state.statusCode).toBe(201);
    expect(state.headers.location).toBe("/users/1");
    expect(state.ended).toBe(true);
    expect(state.body).toBeUndefined();
  });

  it("noContent ends the response with status 204", () => {
    const { response, state } = createResponse();

    Results.noContent().apply(response);

    expect(state.statusCode).toBe(204);
    expect(state.ended).toBe(true);
  });

  it("json accepts a custom status code and headers", () => {
    const { response, state } = createResponse();

    Results.json({ ok: true }, 202, { "x-trace": "abc" }).apply(response);

    expect(state.statusCode).toBe(202);
    expect(state.headers["x-trace"]).toBe("abc");
    expect(state.body).toEqual({ ok: true });
  });

  it("error helpers use a default body", () => {
    const { response, state } = createResponse();

    Results.notFound().apply(response);

    expect(state.statusCode).toBe(404);
    expect(state.headers["content-type"]).toBe("application/problem+json");
    expect(state.body).toMatchObject({ title: "Not Found", status: 404 });
  });

  it("error helpers accept a custom body", () => {
    const { response, state } = createResponse();

    Results.badRequest({ error: "Name is required." }).apply(response);

    expect(state.statusCode).toBe(400);
    expect(state.body).toEqual({ error: "Name is required." });
  });

  it("status without a body ends the response", () => {
    const { response, state } = createResponse();

    Results.status(418).apply(response);

    expect(state.statusCode).toBe(418);
    expect(state.ended).toBe(true);
  });
});

describe("HttpPipeline with results", () => {
  it("applies a returned result instead of serializing it", async () => {
    const { context, state } = createContext();

    await new HttpPipeline().execute(context, [], () => Results.notFound());

    expect(state.statusCode).toBe(404);
    expect(state.body).toMatchObject({ title: "Not Found", status: 404 });
  });
});

describe("Results.problemDetails", () => {
  it("builds a Problem Details body with the title for the status", () => {
    const { context, state } = createContext();

    Results.problemDetails(422).apply(context.response, context);

    expect(state.statusCode).toBe(422);
    expect(state.headers["content-type"]).toBe("application/problem+json");
    expect(state.body).toEqual({
      type: "about:blank",
      title: "Unprocessable Content",
      status: 422,
      instance: "/test",
    });
  });

  it("includes detail, code and extension members", () => {
    const { context, state } = createContext();

    Results.problemDetails(422, {
      detail: "Insufficient funds.",
      code: "INSUFFICIENT_FUNDS",
      extensions: { balance: 10 },
    }).apply(context.response, context);

    expect(state.body).toMatchObject({
      status: 422,
      detail: "Insufficient funds.",
      code: "INSUFFICIENT_FUNDS",
      balance: 10,
    });
  });

  it("uses a custom type and title when given", () => {
    const { context, state } = createContext();

    Results.problemDetails(409, {
      type: "https://example.com/problems/duplicate",
      title: "Duplicate user",
    }).apply(context.response, context);

    expect(state.body).toMatchObject({
      type: "https://example.com/problems/duplicate",
      title: "Duplicate user",
    });
  });

  it("omits instance when applied without a context", () => {
    const { response, state } = createResponse();

    Results.problemDetails(404).apply(response);

    expect(state.body).not.toHaveProperty("instance");
  });
});
