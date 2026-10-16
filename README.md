# NodeCore

NodeCore is a lightweight TypeScript framework for building Node.js HTTP APIs.
It provides a minimal, expressive routing API, composable middleware, a small
dependency container, and an adapter layer that lets you run the same
application on different HTTP servers. The first adapter ships for
[Fastify](https://fastify.dev/).

## Features

- **Minimal routing API** — register handlers with `mapGet`, `mapPost`,
  `mapPut`, `mapPatch` and `mapDelete`.
- **Route groups** — nest groups to share a path prefix and middleware.
- **Middleware** — apply middleware globally with `app.use()` or to a single
  group with `group.use()`.
- **Dependency container** — register services once and resolve them from
  any request handler.
- **Structured errors** — throw typed errors such as `NotFoundError` and let
  the built-in error handler convert them into consistent JSON responses.
- **Pluggable HTTP adapters** — the core does not depend on a specific server.
- **TypeScript-first** — ships type declarations and is distributed as ESM.

## Requirements

- Node.js **22 or later**

## Installation

Install the core package and the Fastify adapter. The adapter installs
Fastify as a dependency, so you do not need to add it yourself:

```bash
yarn add node-core-kit node-core-kit-adapter-fastify
```

Or with npm:

```bash
npm install node-core-kit node-core-kit-adapter-fastify
```

## Quick start

```typescript
import { Application } from "node-core-kit";
import { FastifyAdapter } from "node-core-kit-adapter-fastify";

const app = new Application({
  http: new FastifyAdapter(),
  port: 3000,
});

app.mapGet("/health", () => ({
  status: "ok",
}));

await app.start();
```

Start the server and call the endpoint:

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## Core concepts

### Application

`Application` is the entry point. It receives an HTTP adapter and a port,
collects your routes and middleware, and starts the server.

```typescript
const app = new Application({
  http: new FastifyAdapter({ logger: true }), // options are passed to Fastify
  port: 3000,
});

await app.start();
// ...
await app.stop();
```

Routes and middleware must be registered before `app.start()` is called.
Calling `start()` twice throws an error.

### Routes and handlers

A handler receives an `HttpContext` and returns the response body:

```typescript
app.mapGet("/users/:id", (context) => ({
  id: context.request.params.id,
}));

app.mapPost("/users", (context) => {
  // context.request.body holds the parsed request body
  return { created: true };
});
```

Response rules:

- A returned value is sent as JSON with status `200`.
- A handler that returns `undefined` sends an empty response with status `204`.
- A handler can take full control by calling `context.response` directly.

Registering the same method and path twice throws an error. Trailing slashes
are normalized, so `/health` and `/health/` are treated as the same route.

### Route groups

Groups share a path prefix and middleware:

```typescript
const api = app.group("/api/v1");
const users = api.group("/users");

users.mapGet("/:id", (context) => ({
  id: context.request.params.id,
})); // matches GET /api/v1/users/:id
```

Call `group.use()` before mapping the routes that should receive that
middleware. Middleware is captured when each route is registered.

### Middleware

A middleware wraps the rest of the pipeline. Call `next()` to continue, and
run code before and after it:

```typescript
import type { HttpContext, HttpMiddleware } from "node-core-kit";

class RequestTimer implements HttpMiddleware {
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

app.use(new RequestTimer());
```

Execution order: the built-in error handler runs first, then global
middleware in registration order, then group middleware from the outermost
group to the innermost, and finally the route handler.

### Error handling

`ErrorHandlerMiddleware` is registered automatically. It converts thrown
errors into JSON responses:

| Error class         | Status | `error` code            |
| ------------------- | ------ | ----------------------- |
| `ValidationError`   | 400    | `VALIDATION_ERROR`      |
| `UnauthorizedError` | 401    | `UNAUTHORIZED`          |
| `ForbiddenError`    | 403    | `FORBIDDEN`             |
| `NotFoundError`     | 404    | `NOT_FOUND`             |
| `ConflictError`     | 409    | `CONFLICT`              |
| Any other error     | 500    | `INTERNAL_SERVER_ERROR` |

```typescript
import { NotFoundError } from "node-core-kit";

app.mapGet("/users/:id", (context) => {
  const user = findUser(context.request.params.id); // your own lookup

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  return user;
});
```

Response for the example above:

```json
{ "error": "NOT_FOUND", "message": "User not found." }
```

For status codes below 500, the error message is returned to the client. For
500 errors, the client receives a generic message, and the original error is
logged on the server, so internal details are not leaked.

Custom errors can extend `AppError(message, code, statusCode)`.

### Dependency container

Register services on `app.services` and resolve them from `context.services`:

```typescript
interface UserRepository {
  findById(id: string): Promise<{ id: string; name: string } | undefined>;
}

const USER_REPOSITORY = Symbol("UserRepository");

app.services.register<UserRepository>(USER_REPOSITORY, {
  async findById(id) {
    return { id, name: "Ada" };
  },
});

app.mapGet("/users/:id", async (context) => {
  const repository = context.services.get<UserRepository>(USER_REPOSITORY);
  return repository.findById(context.request.params.id);
});
```

Tokens can be strings, symbols, or class constructors. `register()` throws if
the token already exists; use `replace()` to overwrite it, `has()` to check
for it, and `get()` to resolve it (which throws if it is missing).

## Packages

| Package                         | Description                                            |
| ------------------------------- | ------------------------------------------------------ |
| `node-core-kit`                 | Application, routing, middleware, container and errors |
| `node-core-kit-adapter-fastify` | HTTP adapter backed by Fastify 5                       |

### Fastify adapter

`FastifyAdapter` accepts the same options as Fastify's constructor, such as
`logger`. The server listens on `0.0.0.0`, which accepts connections from any
network interface. Put it behind a reverse proxy or firewall if that is not
what you want.

### Writing your own adapter

An adapter implements the `HttpAdapter` interface from the core package:
`register(routes, services, middlewares)`, `listen(port)` and `close()`. Use
`HttpPipeline` to execute middleware and handlers consistently across
adapters.

## Example project

The [`examples/basic-api`](examples/basic-api) workspace shows route groups,
nested groups, global middleware (a request logger) and a parameterized route:

```bash
yarn install
yarn workspace node-core-example-basic-api dev
```

The server listens on `PORT` (default `3000`):

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/v1/status
curl http://localhost:3000/api/v1/users/42
```

## Development

This is a Yarn 4 monorepo. Corepack, included with Node.js 22, provides the
pinned Yarn version.

```bash
corepack enable
yarn install
yarn build         # compile all packages
yarn test          # run the test suites
yarn lint          # type-check all packages
yarn format:check  # verify Prettier formatting
```

Project layout:

```
packages/
  core/             node-core-kit
  adapter-fastify/  node-core-kit-adapter-fastify
examples/
  basic-api/        Runnable example API
```

## Documentation

This README covers the main concepts. For contribution rules, see
[CONTRIBUTING.md](CONTRIBUTING.md). The source is the most detailed reference:
the public API is exported from
[packages/core/src/index.ts](packages/core/src/index.ts).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
before opening a pull request.

## License

NodeCore is released under the [MIT License](LICENSE).
