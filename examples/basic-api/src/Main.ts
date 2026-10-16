import {
  Application,
  endpoint,
  type HttpContext,
  type HttpMiddleware,
  Results,
  routeParam,
  ValidationError,
} from "@cassianolucas/node-core-kit";

import { FastifyAdapter } from "@cassianolucas/node-core-kit-adapter-fastify";

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

// A plain function is a valid model parser: no validation library needed.
const parseCreateUser = (input: unknown) => {
  const name = (input as { name?: unknown } | undefined)?.name;

  if (typeof name !== "string" || name.length === 0) {
    throw new ValidationError("Name is required.");
  }

  return { name };
};

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

users.mapGet(
  "/:id",
  endpoint((id: string) => ({ id }), routeParam("id")),
);

users.mapPost("/", { body: parseCreateUser }, (context) =>
  Results.created("/api/v1/users/1", { id: "1", name: context.body.name }),
);

try {
  console.info("NodeCore example API starting");
  await app.run();
  console.info("NodeCore example API stopped");
} catch (error) {
  console.error("Failed to run application", error);
  process.exitCode = 1;
}
