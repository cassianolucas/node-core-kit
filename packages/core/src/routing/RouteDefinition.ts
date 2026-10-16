import { HttpMethod, HttpMiddleware } from "../http/index.js";
import { EndpointFilter, RouteHandler } from "./index.js";

export interface RouteDefinition {
  readonly method: HttpMethod;
  readonly path: string;
  readonly handler: RouteHandler;
  readonly middlewares: readonly HttpMiddleware[];
  readonly filters?: readonly EndpointFilter[];
}
