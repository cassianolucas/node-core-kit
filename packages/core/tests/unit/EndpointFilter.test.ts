import { describe, expect, it } from "vitest";
import {
  Container,
  EndpointFilter,
  HttpContext,
  RouteHandler,
} from "../../src/index.js";
import { applyFilters } from "../../src/routing/EndpointFilter.js";

const context = {
  request: {},
  response: {},
  services: new Container(),
} as unknown as HttpContext;

describe("applyFilters", () => {
  it("returns the original handler when there are no filters", () => {
    const handler: RouteHandler = () => ({ ok: true });

    expect(applyFilters([], handler)).toBe(handler);
  });

  it("runs filters in order before the handler", async () => {
    const calls: string[] = [];

    const first: EndpointFilter = async (_, next) => {
      calls.push("first");
      return next();
    };
    const second: EndpointFilter = async (_, next) => {
      calls.push("second");
      return next();
    };
    const handler: RouteHandler = () => {
      calls.push("handler");
      return "done";
    };

    const result = await applyFilters([first, second], handler)(context);

    expect(result).toBe("done");
    expect(calls).toEqual(["first", "second", "handler"]);
  });

  it("stops the chain when a filter does not call next", async () => {
    let handlerCalled = false;

    const blocker: EndpointFilter = () => "blocked";
    const handler: RouteHandler = () => {
      handlerCalled = true;
      return "done";
    };

    await expect(applyFilters([blocker], handler)(context)).resolves.toBe(
      "blocked",
    );
    expect(handlerCalled).toBe(false);
  });

  it("lets a filter transform the result of the next step", async () => {
    const wrap: EndpointFilter = async (_, next) => ({
      data: await next(),
    });
    const handler: RouteHandler = () => 42;

    await expect(applyFilters([wrap], handler)(context)).resolves.toEqual({
      data: 42,
    });
  });
});
