import {
  Application,
  type HttpContext,
  type HttpMiddleware,
} from "node-core-kit";

import { FastifyAdapter } from "node-core-kit-adapter-fastify";

class RequestLogger implements HttpMiddleware {
  async execute(
    context: HttpContext,
    next: () => Promise<void>,
  ): Promise<void> {
    const startedAt = Date.now();

    try {
      await next();
    } finally {
      console.info({
        method: context.request.method,
        path: context.request.path,
        statusCode: context.response.statusCode,
        durationMs: Date.now() - startedAt,
      });
    }
  }
}

const app = new Application({
  http: new FastifyAdapter({
    logger: true,
  }),
  port: Number(process.env.PORT ?? 3000),
});

app.use(new RequestLogger());

app.mapGet("/health", () => ({
  status: "ok",
}));

const api = app.group("/api/v1");

api.mapGet("/status", () => ({
  application: "node-core-example",
  status: "running",
}));

const users = api.group("/users");

users.mapGet("/:id", (context) => ({
  id: context.request.params.id,
}));

try {
  await app.start();
  console.info("NodeCore example API started");
} catch (error) {
  console.error("Failed to start application", error);
  process.exitCode = 1;
}
