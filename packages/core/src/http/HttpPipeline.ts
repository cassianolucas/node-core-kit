import { RouteHandler } from "../routing/index.js";
import { HttpContext, HttpMiddleware } from "./index.js";
import { isHttpResult } from "./HttpResult.js";

export class HttpPipeline {
  /**
   * Runs one request. A new service scope is created for the request, so
   * scoped services are shared within it and disposed when it finishes.
   */
  async execute(
    context: HttpContext,
    middlewares: readonly HttpMiddleware[],
    handler: RouteHandler,
  ): Promise<void> {
    const scope = context.services.createScope();

    try {
      await this.run({ ...context, services: scope }, middlewares, handler);
    } finally {
      await scope.dispose();
    }
  }

  private async run(
    context: HttpContext,
    middlewares: readonly HttpMiddleware[],
    handler: RouteHandler,
  ): Promise<void> {
    let index = -1;

    const dispatch = async (currentIndex: number): Promise<void> => {
      if (currentIndex <= index) {
        throw new Error("next() called multiple times");
      }

      index = currentIndex;

      if (context.response.sent) {
        return;
      }

      const middleware = middlewares[currentIndex];

      if (middleware) {
        await middleware.execute(context, () => dispatch(currentIndex + 1));

        return;
      }

      const result = await handler(context);

      if (context.response.sent) {
        return;
      }

      if (isHttpResult(result)) {
        result.apply(context.response, context);
        return;
      }

      if (result === undefined) {
        context.response.status(204).end();
        return;
      }

      context.response.json(result);
    };

    await dispatch(0);
  }
}
