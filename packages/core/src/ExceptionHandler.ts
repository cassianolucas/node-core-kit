import type { HttpContext } from "./http/index.js";

/**
 * Handles one kind of error. Return `true` after writing the response, or
 * `false` to pass the error to the next handler and then to the default one.
 */
export interface ExceptionHandler {
  tryHandle(context: HttpContext, error: unknown): boolean | Promise<boolean>;
}
