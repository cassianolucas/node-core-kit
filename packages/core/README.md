# @cassianolucas/node-core-kit

Core of NodeCore, a lightweight TypeScript framework for Node.js APIs. It has no
runtime dependencies. Pair it with an HTTP adapter:

```bash
npm install @cassianolucas/node-core-kit @cassianolucas/node-core-kit-adapter-fastify
```

```typescript
import { Application } from "@cassianolucas/node-core-kit";
import { FastifyAdapter } from "@cassianolucas/node-core-kit-adapter-fastify";

const app = new Application({ http: new FastifyAdapter() });

app.mapGet("/users/:id", (context) => ({ id: context.request.params.id }));

await app.run(); // starts, stops on SIGINT or SIGTERM, and disposes services
```

Full documentation is in the [project repository](https://github.com/cassianolucas/node-core-kit#readme).
