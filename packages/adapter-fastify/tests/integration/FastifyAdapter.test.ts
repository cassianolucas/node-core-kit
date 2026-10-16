import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Application } from "node-core-kit";
import { FastifyAdapter } from "../../src/index.js";

const applications: Application[] = [];

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to determine an available port."));
        return;
      }

      const { port } = address;

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function createStartedApplication(configure: (app: Application) => void) {
  const port = await getAvailablePort();

  const app = new Application({
    http: new FastifyAdapter({ logger: false }),
    port,
  });

  configure(app);
  await app.start();

  applications.push(app);

  return {
    app,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

afterEach(async () => {
  const runningApplications = applications.splice(0);

  for (const app of runningApplications) {
    await app.stop();
  }
});

describe("FastifyAdapter - HTTP integration", () => {
  it("returns JSON from a GET request", async () => {
    const { baseUrl } = await createStartedApplication((app) => {
      app.mapGet("/health", () => ({
        status: "ok",
      }));
    });

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
    });
  });

  it("passes route parameters to the handler", async () => {
    const { baseUrl } = await createStartedApplication((app) => {
      app.mapGet("/users/:id", ({ request }) => ({
        id: request.params.id,
      }));
    });

    const response = await fetch(`${baseUrl}/users/42`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "42",
    });
  });

  it("passes query parameters to the handler", async () => {
    const { baseUrl } = await createStartedApplication((app) => {
      app.mapGet("/search", ({ request }) => ({
        term: request.query.term,
      }));
    });

    const response = await fetch(`${baseUrl}/search?term=fastify`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      term: "fastify",
    });
  });

  it("passes the JSON request body to a POST handler", async () => {
    const { baseUrl } = await createStartedApplication((app) => {
      app.mapPost("/users", ({ request, response }) => {
        response.status(201).json({
          created: true,
          user: request.body,
        });
      });
    });

    const response = await fetch(`${baseUrl}/users`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "John",
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      created: true,
      user: {
        name: "John",
      },
    });
  });

  it("returns 404 for an unregistered route", async () => {
    const { baseUrl } = await createStartedApplication(() => {});

    const response = await fetch(`${baseUrl}/unknown`);

    expect(response.status).toBe(404);
  });
});
