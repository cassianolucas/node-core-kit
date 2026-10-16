import { describe, expect, it } from "vitest";
import { Container } from "../../src/index.js";

describe("Container", () => {
  it("registers and resolves a service by string token", () => {
    const container = new Container();
    const service = { name: "mailer" };

    container.register("mailer", service);

    expect(container.has("mailer")).toBe(true);
    expect(container.get<typeof service>("mailer")).toBe(service);
  });

  it("supports symbol tokens", () => {
    const container = new Container();
    const token = Symbol("logger");
    const service = { log: () => "logged" };

    container.register(token, service);

    expect(container.has(token)).toBe(true);
    expect(container.get<typeof service>(token).log()).toBe("logged");
  });

  it("supports class tokens", () => {
    class UserService {
      getName(): string {
        return "Ada";
      }
    }

    const container = new Container();
    const service = new UserService();

    container.register(UserService, service);

    expect(container.has(UserService)).toBe(true);
    expect(container.get(UserService)).toBe(service);
    expect(container.get(UserService).getName()).toBe("Ada");
  });

  it("throws when registering a token that already exists", () => {
    const container = new Container();

    container.register("cache", { enabled: true });

    expect(() => container.register("cache", { enabled: false })).toThrow(
      "Service already registered: cache",
    );
  });

  it("replaces an existing service", () => {
    const container = new Container();
    const replacement = { version: 2 };

    container.register("config", { version: 1 });
    container.replace("config", replacement);

    expect(container.get<typeof replacement>("config")).toBe(replacement);
  });

  it("registers a service through replace when the token does not exist", () => {
    const container = new Container();
    const service = { enabled: true };

    container.replace("feature", service);

    expect(container.has("feature")).toBe(true);
    expect(container.get<typeof service>("feature")).toBe(service);
  });

  it("returns false for an unregistered token", () => {
    const container = new Container();

    expect(container.has("missing")).toBe(false);
  });

  it("throws when resolving an unregistered token", () => {
    const container = new Container();

    expect(() => container.get("missing")).toThrow(
      "Service not registered: missing",
    );
  });

  it("allows an explicitly registered undefined value", () => {
    const container = new Container();

    container.register("optional", undefined);

    expect(container.has("optional")).toBe(true);
    expect(container.get("optional")).toBeUndefined();
  });
});
