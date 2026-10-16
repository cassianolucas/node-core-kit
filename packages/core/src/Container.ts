export type ServiceToken<T> =
  string | symbol | (abstract new (...args: never[]) => T);
export type ServiceFactory<T> = (services: Container) => T;
export type ServiceLifetime = "singleton" | "scoped" | "transient";

type Registration<T = unknown> = {
  lifetime: ServiceLifetime;
  factory: ServiceFactory<T>;
  instance?: T;
  hasInstance: boolean;
};

export class Container {
  private readonly registrations = new Map<
    ServiceToken<unknown>,
    Registration
  >();
  private readonly scopedInstances = new Map<ServiceToken<unknown>, unknown>();
  private readonly creationOrder: unknown[] = [];
  private disposed = false;

  constructor(private readonly parent?: Container) {}

  register<T>(token: ServiceToken<T>, instance: T): void {
    this.ensureNotDisposed();
    if (this.registrations.has(token)) {
      throw new Error(`Service already registered: ${String(token)}`);
    }
    this.registrations.set(token, {
      lifetime: "singleton",
      factory: () => instance,
      instance,
      hasInstance: true,
    });
  }

  replace<T>(token: ServiceToken<T>, instance: T): void {
    this.ensureNotDisposed();
    this.registrations.set(token, {
      lifetime: "singleton",
      factory: () => instance,
      instance,
      hasInstance: true,
    });
  }

  registerSingleton<T>(
    token: ServiceToken<T>,
    factory: ServiceFactory<T>,
  ): void {
    this.addFactory(token, factory, "singleton");
  }

  registerScoped<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    this.addFactory(token, factory, "scoped");
  }

  registerTransient<T>(
    token: ServiceToken<T>,
    factory: ServiceFactory<T>,
  ): void {
    this.addFactory(token, factory, "transient");
  }

  has<T>(token: ServiceToken<T>): boolean {
    return this.registrations.has(token) || (this.parent?.has(token) ?? false);
  }

  get<T>(token: ServiceToken<T>): T {
    this.ensureNotDisposed();
    const owner = this.findRegistrationOwner(token);
    if (!owner) {
      throw new Error(`Service not registered: ${String(token)}`);
    }
    const registration = owner.registrations.get(token);
    if (!registration) {
      throw new Error(`Service not registered: ${String(token)}`);
    }
    return this.resolveRegistration(token, registration, owner) as T;
  }

  createScope(): Container {
    this.ensureNotDisposed();
    return new Container(this);
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const errors: unknown[] = [];
    for (const instance of [...this.creationOrder].reverse()) {
      if (
        !instance ||
        (typeof instance !== "object" && typeof instance !== "function")
      ) {
        continue;
      }
      try {
        const disposable = instance as { dispose?: () => void | Promise<void> };
        if (typeof disposable.dispose === "function") {
          await disposable.dispose();
        }
      } catch (error) {
        errors.push(error);
      }
    }
    this.scopedInstances.clear();
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        "One or more services failed to dispose.",
      );
    }
  }

  private addFactory<T>(
    token: ServiceToken<T>,
    factory: ServiceFactory<T>,
    lifetime: ServiceLifetime,
  ): void {
    this.ensureNotDisposed();
    if (this.registrations.has(token)) {
      throw new Error(`Service already registered: ${String(token)}`);
    }
    this.registrations.set(token, { lifetime, factory, hasInstance: false });
  }

  private resolveRegistration(
    token: ServiceToken<unknown>,
    registration: Registration,
    owner: Container,
  ): unknown {
    if (registration.lifetime === "scoped") {
      if (!this.parent) {
        throw new Error(`Scoped service requires a scope: ${String(token)}`);
      }
      if (this.scopedInstances.has(token)) {
        return this.scopedInstances.get(token);
      }
      const instance = registration.factory(this);
      this.scopedInstances.set(token, instance);
      this.creationOrder.push(instance);
      return instance;
    }
    if (registration.lifetime === "transient") {
      // Transient instances are not tracked, so dispose() does not dispose them.
      return registration.factory(this);
    }
    if (registration.hasInstance) {
      return registration.instance;
    }
    const instance = registration.factory(owner);
    registration.instance = instance;
    registration.hasInstance = true;
    owner.creationOrder.push(instance);
    return instance;
  }

  private findRegistrationOwner(
    token: ServiceToken<unknown>,
  ): Container | undefined {
    if (this.registrations.has(token)) {
      return this;
    }
    return this.parent?.findRegistrationOwner(token);
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error("Container has been disposed.");
    }
  }
}
