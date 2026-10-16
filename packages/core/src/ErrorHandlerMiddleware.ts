import { AppError } from "./Errors.js";
import { HttpContext, HttpMiddleware } from "./index.js";

export class ErrorHandlerMiddleware implements HttpMiddleware {
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

      if (error instanceof AppError) {
        context.response.status(error.statusCode).json({
          error: error.code,
          message:
            error.statusCode < 500
              ? error.message
              : "An internal error occurred.",
        });

        return;
      }

      console.error("Unhandled application error:", error);

      context.response.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        message: "An internal error occurred.",
      });
    }
  }
}
