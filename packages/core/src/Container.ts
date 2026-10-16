export type ServiceToken<T> = string | symbol | (new (...args: never[]) => T);

export class Container {
  private readonly instances = new Map<ServiceToken<unknown>, unknown>();

  register<T>(token: ServiceToken<T>, instance: T): void {
    if (this.instances.has(token)) {
      throw new Error(`Service already registered: ${String(token)}`);
    }

    this.instances.set(token, instance);
  }

  replace<T>(token: ServiceToken<T>, instance: T): void {
    this.instances.set(token, instance);
  }

  has<T>(token: ServiceToken<T>): boolean {
    return this.instances.has(token);
  }

  get<T>(token: ServiceToken<T>): T {
    if (!this.instances.has(token)) {
      throw new Error(`Service not registered: ${String(token)}`);
    }

    return this.instances.get(token) as T;
  }
}
