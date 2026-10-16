import { describe, expect, it } from "vitest";
import { Container } from "../../src/index.js";

class Disposable {
  static disposed: string[] = [];

  constructor(private readonly name: string) {}

  dispose(): void {
    Disposable.disposed.push(this.name);
  }
}

describe("Container lifetimes", () => {
  it("creates a singleton once and shares it across scopes", () => {
    const root = new Container();
    let created = 0;

    root.registerSingleton("counter", () => ({ id: ++created }));

    const scope = root.createScope();

    expect(root.get("counter")).toBe(root.get("counter"));
    expect(scope.get("counter")).toBe(root.get("counter"));
    expect(created).toBe(1);
  });

  it("creates a new transient instance on every resolution", () => {
    const root = new Container();

    root.registerTransient("token", () => ({}));

    expect(root.get("token")).not.toBe(root.get("token"));
  });

  it("requires a scope to resolve a scoped service", () => {
    const root = new Container();

    root.registerScoped("request", () => ({}));

    expect(() => root.get("request")).toThrow(
      "Scoped service requires a scope: request",
    );
  });

  it("shares a scoped instance within a scope and separates it across scopes", () => {
    const root = new Container();

    root.registerScoped("request", () => ({}));

    const first = root.createScope();
    const second = root.createScope();

    expect(first.get("request")).toBe(first.get("request"));
    expect(first.get("request")).not.toBe(second.get("request"));
  });

  it("replace overrides a registered service", () => {
    const container = new Container();

    container.register("config", { version: 1 });
    container.replace("config", { version: 2 });

    expect(container.get<{ version: number }>("config").version).toBe(2);
  });

  it("rejects use after dispose", async () => {
    const container = new Container();

    await container.dispose();

    expect(() => container.get("anything")).toThrow(
      "Container has been disposed.",
    );
  });

  it("disposes created instances in reverse creation order", async () => {
    Disposable.disposed = [];

    const root = new Container();

    root.registerSingleton("first", () => new Disposable("first"));
    root.registerSingleton("second", () => new Disposable("second"));

    root.get("first");
    root.get("second");

    await root.dispose();

    expect(Disposable.disposed).toEqual(["second", "first"]);
  });

  it("does not dispose transient instances", async () => {
    Disposable.disposed = [];

    const root = new Container();

    root.registerTransient("transient", () => new Disposable("transient"));
    root.get("transient");

    await root.dispose();

    expect(Disposable.disposed).toEqual([]);
  });
});
