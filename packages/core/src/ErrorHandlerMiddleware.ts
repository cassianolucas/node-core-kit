import { AppError } from "./Errors.js";
import type { ExceptionHandler } from "./ExceptionHandler.js";
import { HttpContext, HttpMiddleware, Results } from "./http/index.js";

const INTERNAL_MESSAGE = "An internal error occurred.";

export class ErrorHandlerMiddleware implements HttpMiddleware {
  constructor(
    private readonly exceptionHandlers: readonly ExceptionHandler[] = [],
  ) {}

  async execute(
    context: HttpContext,
    next: () => Promise<void>,
  ): Promise<void> {
    try {
      await next();
    } catch (error: unknown) {
      if (context.response.sent) {
        throw error;
      }

      for (const handler of this.exceptionHandlers) {
        if (await handler.tryHandle(context, error)) {
          return;
        }
      }

      if (error instanceof AppError) {
        // Client errors show their message. Server errors stay generic.
        Results.problemDetails(error.statusCode, {
          detail: error.statusCode < 500 ? error.message : INTERNAL_MESSAGE,
          code: error.code,
        }).apply(context.response, context);

        return;
      }

      console.error("Unhandled application error:", error);

      Results.problemDetails(500, {
        detail: INTERNAL_MESSAGE,
        code: "INTERNAL_SERVER_ERROR",
      }).apply(context.response, context);
    }
  }
}
