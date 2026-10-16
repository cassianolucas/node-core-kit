# NodeCore

NodeCore is a lightweight TypeScript framework for building Node.js HTTP APIs.
It provides a minimal, expressive routing API, composable middleware, a small
dependency container, and an adapter layer that lets you run the same
application on different HTTP servers. The first adapter ships for
[Fastify](https://fastify.dev/).

## Features

- **Minimal routing API**: `mapGet`, `mapPost`, `mapPut`, `mapPatch` and `mapDelete`.
- **Typed route parameters**: `"/users/:id"` gives `context.request.params.id` the type `string`.
- **Route groups**: nested groups share a prefix, middleware and filters.
- **Middleware and filters**: global or per group, with a single pipeline on every adapter.
- **Model binding**: validate bodies and queries with a plain function or a library such as zod.
- **Dependency injection**: singleton, scoped (one per request) and transient services.
- **Problem Details errors**: RFC 7807 responses, with exception handlers to customize them.
- **Graceful shutdown**: `app.run()` stops on `SIGINT` or `SIGTERM` and lets in-flight requests finish.
- **Configurable server**: host, body size limit, request timeout and shutdown timeout.
- **Interchangeable adapters**: Fastify or `node:http`, both verified by the same behavior tests.
- **Test adapter**: test routes in memory, without opening a port.
- **TypeScript-first**: ships type declarations and is distributed as ESM.

## Requirements

- Node.js **22 or later**

## Installation

Install the core package and one HTTP adapter:

```bash
npm install @cassianolucas/node-core-kit @cassianolucas/node-core-kit-adapter-fastify
```

The Fastify adapter installs Fastify as a dependency. If you prefer no
third-party HTTP server, use the `node:http` adapter, which has no runtime
dependencies:

```bash
npm install @cassianolucas/node-core-kit @cassianolucas/node-core-kit-adapter-node
```

With yarn, use `yarn add` in place of `npm install`.

## Quick start

```typescript
import { Application } from "@cassianolucas/node-core-kit";
import { FastifyAdapter } from "@cassianolucas/node-core-kit-adapter-fastify";

const app = new Application({
  http: new FastifyAdapter(),
  port: 3000,
});

app.mapGet("/health", () => ({
  status: "ok",
}));

await app.run(); // starts the server; stops it cleanly on Ctrl+C or SIGTERM
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

Routes, middleware and filters must be registered before `app.start()` is
called. Calling `start()` while the application is running throws an error.

`stop()` is final: once an application has stopped, it cannot be started
again. Create a new `Application` instead. Call `dispose()` to also dispose
the services it created.

#### Configuration

| Option              | Default       | Description                                                      |
| ------------------- | ------------- | ---------------------------------------------------------------- |
| `port`              | `3000`        | Port to listen on. Use `0` for a free port chosen by the system. |
| `host`              | `"127.0.0.1"` | Interface to bind to. Use `"0.0.0.0"` in containers.             |
| `bodyLimit`         | 1 MiB         | Maximum request body size in bytes. Larger bodies get `413`.     |
| `requestTimeoutMs`  | 30 000        | Time allowed to receive a complete request.                      |
| `shutdownTimeoutMs` | 10 000        | Time in-flight requests get to finish on shutdown.               |

```typescript
const app = new Application({
  http: new FastifyAdapter(),
  host: "0.0.0.0",
  port: 8080,
  bodyLimit: 256 * 1024,
});
```

The server binds to `127.0.0.1` by default, so it accepts local connections only.
Set `host` to `"0.0.0.0"` when it must accept traffic from other machines.

#### Lifecycle and shutdown

- `app.run()` starts the application, waits for `SIGINT` or `SIGTERM`, then stops
  it and disposes its services. Use it for servers.
- `app.start()` and `app.stop()` give you manual control. `stop()` waits up to
  `shutdownTimeoutMs` for in-flight requests, then closes their connections.
- `stop()` is final. Create a new `Application` to run again.

```typescript
await app.run();
// After a shutdown signal: no new connections, in-flight requests finished
// (or closed after shutdownTimeoutMs), scoped and singleton services disposed.
```

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
- A handler can return a result helper to control the status code and headers.
- A handler can take full control by calling `context.response` directly.

Result helpers live on `Results`:

```typescript
import { Results } from "@cassianolucas/node-core-kit";

app.mapPost("/users", (context) => {
  const user = createUser(context.request.body); // your own logic
  return Results.created(`/users/${user.id}`, user);
});

app.mapDelete("/users/:id", () => Results.noContent());
```

| Helper                                  | Status | Notes                                          |
| --------------------------------------- | ------ | ---------------------------------------------- |
| `Results.ok(body)`                      | 200    |                                                |
| `Results.created(location, body?)`      | 201    | Sets the `location` header                     |
| `Results.noContent()`                   | 204    | Empty response                                 |
| `Results.json(body, status?, headers?)` | custom | Custom status code and headers                 |
| `Results.badRequest(body?)`             | 400    | Problem Details body (`title`: "Bad Request")  |
| `Results.unauthorized(body?)`           | 401    | Problem Details body (`title`: "Unauthorized") |
| `Results.forbidden(body?)`              | 403    | Problem Details body (`title`: "Forbidden")    |
| `Results.notFound(body?)`               | 404    | Problem Details body (`title`: "Not Found")    |
| `Results.conflict(body?)`               | 409    | Problem Details body (`title`: "Conflict")     |
| `Results.status(code, body?)`           | custom | Any status code; no body when omitted          |

Registering the same method and path twice throws an error. Trailing slashes
are normalized, so `/health` and `/health/` are treated as the same route.

#### Typed route parameters

Parameters in a literal path are typed from the path:

```typescript
app.mapGet("/users/:id/posts/:postId", (context) => {
  // context.request.params is { readonly id: string; readonly postId: string }
  return {
    user: context.request.params.id,
    post: context.request.params.postId,
  };
});
```

#### Route options

Map methods take an optional last argument with route-level options. Filters
in `filters` run only for that route, after the group and global filters:

```typescript
app.mapDelete("/users/:id", () => Results.noContent(), {
  filters: [requireAdmin],
});
```

### Route groups

Groups share a path prefix and middleware:

```typescript
const api = app.group("/api/v1");
const users = api.group("/users");

users.mapGet("/:id", (context) => ({
  id: context.request.params.id,
})); // matches GET /api/v1/users/:id
```

Call `group.use()` and `group.useFilter()` before mapping the routes that
should receive them. Middleware and filters are captured when each route is
registered.

### Middleware

A middleware wraps the rest of the pipeline. Call `next()` to continue, and
run code before and after it:

```typescript
import type { HttpContext, HttpMiddleware } from "@cassianolucas/node-core-kit";

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

`ErrorHandlerMiddleware` is registered automatically. It converts thrown errors
into [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807) Problem Details
responses, sent with `Content-Type: application/problem+json`.

| Error class         | Status | `code`                  |
| ------------------- | ------ | ----------------------- |
| `ValidationError`   | 400    | `VALIDATION_ERROR`      |
| `UnauthorizedError` | 401    | `UNAUTHORIZED`          |
| `ForbiddenError`    | 403    | `FORBIDDEN`             |
| `NotFoundError`     | 404    | `NOT_FOUND`             |
| `ConflictError`     | 409    | `CONFLICT`              |
| Any other error     | 500    | `INTERNAL_SERVER_ERROR` |

```typescript
import { NotFoundError } from "@cassianolucas/node-core-kit";

app.mapGet("/users/:id", (context) => {
  const user = findUser(context.request.params.id); // your own lookup

  if (!user) {
    throw new NotFoundError("User not found.");
  }

  return user;
});
```

`GET /users/1` returns:

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "User not found.",
  "instance": "/users/1",
  "code": "NOT_FOUND"
}
```

- `type`, `title`, `status`, `detail` and `instance` are the standard members.
  `code` is an extension with a machine-readable error code.
- For status codes below 500, `detail` is the error message.
- For status code 500, the client receives a generic `detail`, and the original
  error is logged on the server, so internal details are not exposed.

Custom errors can extend `AppError(message, code, statusCode)`.

#### Exception handlers

An exception handler takes care of one kind of error and writes its own
response. Register handlers with `app.addExceptionHandler()` before
`app.start()`. Handlers run in registration order. Return `true` after writing
the response, or `false` to pass the error to the next handler. If no handler
returns `true`, the default handler responds.

```typescript
import {
  AppError,
  ExceptionHandler,
  HttpContext,
  Results,
} from "@cassianolucas/node-core-kit";

class InsufficientFundsError extends AppError {
  constructor(readonly balance: number) {
    super("Insufficient funds.", "INSUFFICIENT_FUNDS", 422);
  }
}

class InsufficientFundsHandler implements ExceptionHandler {
  tryHandle(context: HttpContext, error: unknown): boolean {
    if (!(error instanceof InsufficientFundsError)) {
      return false;
    }

    Results.problemDetails(422, {
      detail: error.message,
      code: error.code,
      extensions: { balance: error.balance },
    }).apply(context.response, context);

    return true;
  }
}

app.addExceptionHandler(new InsufficientFundsHandler());

app.mapPost("/withdraw", () => {
  throw new InsufficientFundsError(10);
});
```

`POST /withdraw` returns `422` with the Problem Details fields and
`"balance": 10`.

`Results.problemDetails(status, options?)` builds the response. The options are
`detail`, `code`, `title` and `type`, plus `extensions` for extra members. The
`title` defaults to the standard title for the status, and `instance` is filled
with the request path. The same helper works in endpoint results, so a handler
can return `Results.problemDetails(409, { detail: "..." })`.

### Dependency container

Services are registered on `app.services` and resolved from
`context.services` inside handlers. Tokens can be strings, symbols, or class
constructors.

```typescript
interface UserRepository {
  findById(id: string): Promise<{ id: string; name: string } | undefined>;
}

const USER_REPOSITORY = Symbol("UserRepository");

app.services.registerSingleton<UserRepository>(USER_REPOSITORY, () => ({
  async findById(id) {
    return { id, name: "Ada" };
  },
}));

app.mapGet("/users/:id", async (context) => {
  const repository = context.services.get<UserRepository>(USER_REPOSITORY);
  return repository.findById(context.request.params.id);
});
```

Registration methods and lifetimes:

| Method                              | Lifetime  | Behavior                                                   |
| ----------------------------------- | --------- | ---------------------------------------------------------- |
| `register(token, instance)`         | singleton | Registers an existing instance                             |
| `registerSingleton(token, factory)` | singleton | Created once, on first use, and shared                     |
| `registerScoped(token, factory)`    | scoped    | Created once per request                                   |
| `registerTransient(token, factory)` | transient | Created on every resolution; not disposed by the container |
| `replace(token, instance)`          | singleton | Overwrites an existing registration, or adds a new one     |

Other methods:

- `has(token)` returns whether a token is registered.
- `get(token)` resolves a token and throws if it is not registered.
- `createScope()` creates a child container. The framework does this for each
  request; call it yourself only for work outside a request, such as a
  background job.
- `dispose()` disposes the singleton and scoped instances that define a
  `dispose()` method, in reverse creation order. Transient instances are not
  tracked, so their cleanup is the caller's responsibility.

`register`, `registerSingleton`, `registerScoped` and `registerTransient` throw
if the token is already registered. Use `replace` to overwrite a registration.

#### Choosing a lifetime

- **Singleton** — one instance for the whole application. Use it for stateless
  services and shared resources such as database pools. `app.dispose()` cleans
  it up.
- **Scoped** — one instance per request. The framework creates a scope for
  every request and disposes it when the request finishes, so scoped services
  with a `dispose()` method are cleaned up automatically. Use it for services
  that hold per-request state or a resource that should close when the request
  ends.
- **Transient** — a new instance on every resolution. Use it for lightweight
  objects without external resources. The container does not track transients,
  so the garbage collector reclaims them when they are no longer referenced.

The garbage collector frees memory, but it does not call `dispose()` and does
not release external resources such as connections or file handles. A
transient that needs `dispose()` will never be cleaned up by the container. If
a service needs cleanup, register it as singleton or scoped instead.

### Model binding

Pass a parser with the route to validate and type the request body or query
string. The handler receives the parsed value on the context as `body` or
`query`, and its type is inferred from the parser:

```typescript
import { ValidationError } from "@cassianolucas/node-core-kit";

// No validation library needed: a plain function is a valid parser.
const parseCreateUser = (input: unknown) => {
  const name = (input as { name?: unknown } | undefined)?.name;

  if (typeof name !== "string" || name.length === 0) {
    throw new ValidationError("Name is required.");
  }

  return { name };
};

app.mapPost("/users", { body: parseCreateUser }, (context) => {
  // context.body is typed as { name: string }
  return Results.created("/users/1", { name: context.body.name });
});
```

A parser can be a function or an object with a `parse(input)` method, which
is the shape used by libraries such as zod:

```typescript
const CreateUser = z.object({ name: z.string().min(1) });

app.mapPost("/users", { body: CreateUser }, (context) => context.body);
```

Model binding is optional. Routes without a binding work as before.

Error handling:

- A `ValidationError` thrown by the parser keeps its message and returns
  `400 VALIDATION_ERROR`.
- Any other error thrown by the parser also returns `400 VALIDATION_ERROR`, with
  the generic message `Invalid request body.` or `Invalid query parameters.`.
  Internal details are not exposed.
- Filters run before the binding, so an authorization filter rejects a request
  before its body is parsed.

Use `query` in the same way to parse the query string:

```typescript
app.mapGet("/items", { query: parseSearch }, (context) => context.query);
```

### Endpoint bindings

Bindings read values from the request and the container, and pass them as
typed arguments to a handler:

```typescript
import {
  body,
  endpoint,
  queryParam,
  routeParam,
} from "@cassianolucas/node-core-kit";

app.mapPost(
  "/users/:id/notes",
  endpoint(
    (id: string, tag: string | undefined, payload: { text: string }) => ({
      id,
      tag,
      text: payload.text,
    }),
    routeParam("id"),
    queryParam("tag"),
    body<{ text: string }>(),
  ),
);
```

| Binding               | Value                                                |
| --------------------- | ---------------------------------------------------- |
| `routeParam(name)`    | A route parameter; throws if it is missing           |
| `queryParam(name)`    | The first value of a query parameter, or `undefined` |
| `body<T>()`           | The request body, typed as `T`                       |
| `fromServices(token)` | A service from the container                         |

### Endpoint filters

Filters wrap the handler. They run after middleware and before the handler,
and they can change or stop the response:

```typescript
app.useFilter(async (context, next) => {
  if (!context.request.headers["x-api-key"]) {
    return Results.unauthorized({ error: "Missing API key." });
  }

  return next();
});
```

- Call `next()` to continue. If a filter returns without calling it, the
  handler is skipped and the returned value becomes the response.
- A filter can transform the value returned by `next()`.
- Filters run in this order: global filters, then group filters from the
  outermost group to the innermost, then the handler. They run after middleware.
- `app.useFilter()` must be called before `app.start()`.
- `group.useFilter()` applies to the routes of that group and its nested groups.
  Call it before mapping those routes.

## Packages

| Package                                        | Description                                                     |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `@cassianolucas/node-core-kit`                 | Application, routing, middleware, DI, errors and test tools     |
| `@cassianolucas/node-core-kit-adapter-fastify` | HTTP adapter backed by Fastify 5                                |
| `@cassianolucas/node-core-kit-adapter-node`    | HTTP adapter built on `node:http`, with no runtime dependencies |

### Adapters

Both adapters run every request through the same pipeline, answer unknown
routes and oversized bodies with Problem Details, and finish in-flight requests
on shutdown. They pass the same behavior suite, so you can switch between them
without changing your routes.

Fastify options are passed through to Fastify:

```typescript
new FastifyAdapter({ logger: true });
```

### Writing an adapter

An adapter implements `HttpAdapter` from `@cassianolucas/node-core-kit`:

- `register(routes, services, middlewares, options)`: keep the routes; apply
  `options.bodyLimit` and `options.requestTimeoutMs`.
- `listen({ port, host })`: start the server. Expose the bound port as `port`
  after listening, which matters when `port` is `0`.
- `close({ timeoutMs })`: stop accepting connections, wait for in-flight
  requests, and close the rest after `timeoutMs`.

Run every request through `HttpPipeline`. Then run the shared behavior suite
against your adapter with `node-core-kit-adapter-contract` (see
`packages/adapter-node` for an example).

### Testing your application

`@cassianolucas/node-core-kit/testing` provides an in-memory adapter. It runs requests through
the same pipeline without opening a port:

```typescript
import { Application } from "@cassianolucas/node-core-kit";
import { TestHttpAdapter } from "@cassianolucas/node-core-kit/testing";
import { expect, it } from "vitest";

it("creates a user", async () => {
  const http = new TestHttpAdapter();
  const app = new Application({ http });

  app.mapPost("/users", (context) => ({ name: context.request.body }));
  await app.start();

  const response = await http.request("POST", "/users", { body: "Ada" });

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ name: "Ada" });
  await app.stop();
});
```

### Request pipeline

Each request passes through these steps, in this order:

1. **Middleware** registered with `app.use()`, then group middleware. The error
   handler is always the outermost middleware.
2. **Filters** registered with `app.useFilter()`, then group filters, then route
   filters. A filter can stop the request by returning a result.
3. **Model binding**, if the route has one. Invalid input gets `400` before the
   handler runs.
4. **The handler.** Its return value becomes the response. `Results.*` controls
   status codes and headers.
5. **Errors** thrown at any step go to exception handlers, then to the default
   handler, which writes a Problem Details response.

Which mechanism to use:

| Need                                       | Use                            |
| ------------------------------------------ | ------------------------------ |
| Code around every request, such as logging | `app.use()` middleware         |
| Access control or checks before a handler  | `useFilter()` or route filters |
| Validate and type the body or query        | Model binding                  |
| Change how one kind of error is answered   | `addExceptionHandler()`        |
| Set a status code, headers or error body   | `Results.*`                    |

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
curl -i -X POST -H "content-type: application/json" \
  -d '{"name":"Ada"}' http://localhost:3000/api/v1/users
```

## Development

This is a Yarn 4 monorepo. Corepack, included with Node.js 22, provides the
pinned Yarn version.

```bash
corepack enable
yarn install
yarn build           # compile all packages
yarn test            # run the test suites
yarn test:coverage   # run the tests with coverage thresholds
yarn lint            # type-check all packages
yarn format:check    # verify Prettier formatting
yarn bench           # compare throughput with raw servers
```

Project layout:

```
packages/
  core/                 @cassianolucas/node-core-kit
  adapter-fastify/      @cassianolucas/node-core-kit-adapter-fastify
  adapter-node/         @cassianolucas/node-core-kit-adapter-node
  adapter-contract/     shared behavior tests for adapters (private)
examples/
  basic-api/            runnable example API
benchmarks/             throughput comparison (private)
```

### Quality gates

- Coverage thresholds are enforced per package: 85% lines, 85% functions and
  85% statements, and 75% branches in the core and the HTTP adapters.
- CI runs build, lint, tests with coverage, formatting and a dependency audit,
  on Node.js 22 and 24.

### Benchmarks

`yarn bench` serves `GET /health` with 50 concurrent connections for 5 seconds
per scenario. Results from one run on a development machine:

| Scenario                   | Requests/s | p50 (ms) | p99 (ms) |
| -------------------------- | ---------: | -------: | -------: |
| `node:http` (raw)          |     15 192 |     2.90 |     5.86 |
| Fastify (raw)              |     14 871 |     2.97 |     5.91 |
| NodeCore + Fastify adapter |     14 114 |     3.10 |     6.10 |
| NodeCore + Node adapter    |     13 827 |     3.16 |     6.35 |

The load generator runs in the same process as the servers, so compare the
rows with each other, not with production capacity. Run-to-run variation is a
few percent.

### Releases

Versions are managed with [changesets](https://github.com/changesets/changesets):

1. Run `yarn changeset` for each change, choosing the bump for each package.
2. When preparing a release, run `yarn version-packages`. It applies the
   changesets and updates the changelogs.
3. Push a tag such as `v0.2.0`. The release workflow builds, tests and publishes
   the packages with provenance.

## Documentation

This README covers the main concepts. For contribution rules, see
[CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, follow
[SECURITY.md](SECURITY.md). Community standards are in
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). The source is the most detailed
reference: the public API is exported from
[packages/core/src/index.ts](packages/core/src/index.ts).

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md)
before opening a pull request.

## License

NodeCore is released under the [MIT License](LICENSE).
