# node-core-kit-adapter-node

HTTP adapter for [NodeCore](https://github.com/cassianolucas/node-core-kit#readme) built on `node:http`. It has no
runtime dependencies:

```bash
npm install node-core-kit node-core-kit-adapter-node
```

```typescript
import { Application } from "node-core-kit";
import { NodeHttpAdapter } from "node-core-kit-adapter-node";

const app = new Application({ http: new NodeHttpAdapter(), port: 3000 });
```

Both adapters pass the same behavior tests, so you can switch between them
without changing your routes.
