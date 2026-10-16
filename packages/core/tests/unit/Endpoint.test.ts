import { describe, expect, it } from "vitest";
import {
  body,
  Container,
  endpoint,
  fromServices,
  HttpContext,
  queryParam,
  routeParam,
} from "../../src/index.js";

class Greeter {
  greet(name: string): string {
    return `Hello, ${name}`;
  }
}

function createContext(): HttpContext {
  const services = new Container();
  services.register(Greeter, new Greeter());
  services.register("prefix", "Dear");

  return {
    request: {
      method: "POST",
      path: "/users/42",
      params: { id: "42" },
      query: { tag: ["first", "second"] },
      headers: {},
      body: { name: "Ada" },
    },
    response: {} as HttpContext["response"],
    services,
  };
}

describe("endpoint bindings", () => {
  it("routeParam reads a route parameter", () => {
    expect(routeParam("id").resolve(createContext())).toBe("42");
  });

  it("routeParam throws when the parameter is missing", () => {
    expect(() => routeParam("missing").resolve(createContext())).toThrow(
      "Missing route parameter: missing",
    );
  });

  it("queryParam returns the first value of a repeated query parameter", () => {
    expect(queryParam("tag").resolve(createContext())).toBe("first");
  });

  it("queryParam returns undefined when the parameter is absent", () => {
    expect(queryParam("absent").resolve(createContext())).toBeUndefined();
  });

  it("body returns the request body", () => {
    expect(body<{ name: string }>().resolve(createContext())).toEqual({
      name: "Ada",
    });
  });

  it("fromServices resolves by class and by token", () => {
    const context = createContext();

    expect(fromServices(Greeter).resolve(context)).toBeInstanceOf(Greeter);
    expect(fromServices<string>("prefix").resolve(context)).toBe("Dear");
  });

  it("endpoint passes resolved values to the handler in binding order", async () => {
    const handler = endpoint(
      (id: string, payload: { name: string }, greeter: Greeter) =>
        greeter.greet(`${id}:${payload.name}`),
      routeParam("id"),
      body<{ name: string }>(),
      fromServices(Greeter),
    );

    await expect(handler(createContext())).resolves.toBe("Hello, 42:Ada");
  });
});
