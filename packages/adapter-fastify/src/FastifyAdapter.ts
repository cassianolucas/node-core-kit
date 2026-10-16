import Fastify from "fastify";
import type { FastifyInstance, FastifyServerOptions } from "fastify";

import type {
  Container,
  HttpAdapter,
  HttpContext,
  HttpMiddleware,
  HttpResponse,
  RouteDefinition,
} from "node-core-kit";
import { HttpPipeline } from "node-core-kit";

export class FastifyAdapter implements HttpAdapter {
  private readonly server: FastifyInstance;
  private registered = false;

  constructor(options: FastifyServerOptions = {}) {
    this.server = Fastify(options);
  }

  register(
    routes: readonly RouteDefinition[],
    services: Container,
    middlewares: readonly HttpMiddleware[],
  ): void {
    if (this.registered) {
      throw new Error("Fastify routes have already been registered");
    }

    this.registered = true;

    const pipeline = new HttpPipeline();

    for (const route of routes) {
      this.server.route({
        method: route.method,
        url: route.path,
        handler: async (request, reply) => {
          const response: HttpResponse = {
            get statusCode() {
              return reply.statusCode;
            },

            get sent() {
              return reply.sent;
            },

            status(code: number) {
              reply.code(code);
              return this;
            },

            json(body: unknown) {
              reply.send(body);
            },

            end() {
              reply.send();
            },
          };

          const context: HttpContext = {
            request: {
              method: route.method,
              path: request.url,
              params: request.params as Record<string, string>,
              query: request.query as Record<string, unknown>,
              headers: request.headers,
              body: request.body,
            },
            response,
            services,
          };

          try {
            await pipeline.execute(
              context,
              [...middlewares, ...route.middlewares],
              route.handler,
            );
          } catch (error) {
            request.log.error({ err: error }, "Unhandled request error");

            if (!reply.sent) {
              reply.code(500).send({
                error: "Internal Server Error",
              });
            }
          }
        },
      });
    }
  }

  async listen(port: number): Promise<void> {
    await this.server.listen({
      port,
      host: "0.0.0.0",
    });
  }

  async close(): Promise<void> {
    await this.server.close();
  }
}
