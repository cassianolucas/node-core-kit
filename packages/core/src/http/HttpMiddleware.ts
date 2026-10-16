import { HttpContext } from "./HttpContext.js";

export type Next = () => Promise<void>;

export interface HttpMiddleware {
  execute(context: HttpContext, next: Next): Promise<void> | void;
}
