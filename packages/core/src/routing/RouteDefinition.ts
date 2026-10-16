import { HttpMethod, HttpMiddleware } from "../http/index.js";
import { RouteHandler } from "./index.js";

export interface RouteDefinition {
  readonly method: HttpMethod;
  readonly path: string;
  readonly handler: RouteHandler;
  readonly middlewares: readonly HttpMiddleware[];
}
