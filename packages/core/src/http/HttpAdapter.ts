import { Container, HttpMiddleware } from "../index.js";
import { RouteDefinition } from "../routing/index.js";

export interface HttpAdapter {
  register(
    routes: readonly RouteDefinition[],
    services: Container,
    middlewares: readonly HttpMiddleware[],
  ): void;

  listen(port: number): Promise<void>;
  close(): Promise<void>;
}
