import { RouteHandler } from "../routing/index.js";
import { HttpContext, HttpMiddleware } from "./index.js";

export class HttpPipeline {
  async execute(
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

      if (result === undefined) {
        context.response.status(204).end();
        return;
      }

      context.response.json(result);
    };

    await dispatch(0);
  }
}
