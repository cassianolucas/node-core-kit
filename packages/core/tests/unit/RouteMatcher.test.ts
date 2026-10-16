import { describe, expect, it } from "vitest";
import { findRoute, matchRoute } from "../../src/index.js";

describe("matchRoute", () => {
  it("captures named segments", () => {
    expect(matchRoute("/users/:id/posts/:postId", "/users/42/posts/7")).toEqual(
      {
        id: "42",
        postId: "7",
      },
    );
  });

  it("returns undefined when a literal segment differs", () => {
    expect(matchRoute("/users/:id", "/accounts/42")).toBeUndefined();
  });

  it("returns undefined when the number of segments differs", () => {
    expect(matchRoute("/users/:id", "/users/42/extra")).toBeUndefined();
  });

  it("ignores trailing slashes", () => {
    expect(matchRoute("/users/:id", "/users/42/")).toEqual({ id: "42" });
  });

  it("decodes encoded segments and keeps invalid encodings as they are", () => {
    expect(matchRoute("/files/:name", "/files/a%20b")).toEqual({ name: "a b" });
    expect(matchRoute("/files/:name", "/files/%E0%A4%A")).toEqual({
      name: "%E0%A4%A",
    });
  });
});

describe("findRoute", () => {
  const routes = [
    { method: "GET", path: "/users/:id" },
    { method: "POST", path: "/users" },
  ];

  it("finds the route for the method and path", () => {
    expect(findRoute(routes, "GET", "/users/9")?.params).toEqual({ id: "9" });
    expect(findRoute(routes, "POST", "/users")?.route.method).toBe("POST");
  });

  it("does not match a different method", () => {
    expect(findRoute(routes, "DELETE", "/users/9")).toBeUndefined();
  });
});
