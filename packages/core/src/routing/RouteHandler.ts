import { HttpContext } from "../http/index.js";

export type RouteHandler = (context: HttpContext) => unknown | Promise<unknown>;
