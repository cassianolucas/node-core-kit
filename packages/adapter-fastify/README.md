# @cassianolucas/node-core-kit-adapter-fastify

Fastify adapter for [NodeCore](https://github.com/cassianolucas/node-core-kit#readme). Fastify is installed as a
dependency, so you only need this package and `@cassianolucas/node-core-kit`:

```bash
npm install @cassianolucas/node-core-kit @cassianolucas/node-core-kit-adapter-fastify
```

```typescript
import { Application } from "@cassianolucas/node-core-kit";
import { FastifyAdapter } from "@cassianolucas/node-core-kit-adapter-fastify";

const app = new Application({
  http: new FastifyAdapter({ logger: true }), // options are passed to Fastify
  port: 3000,
});
```
