// Compares request throughput and latency for the same JSON endpoint across
// raw servers and NodeCore on each adapter.
//
// The load generator runs in the same process as the servers, so the numbers
// compare the scenarios with each other. They are not absolute capacity.
//
//   BENCH_DURATION_MS=5000 BENCH_CONCURRENCY=50 yarn bench

import { createServer } from "node:http";
import Fastify from "fastify";
import { Application } from "node-core-kit";
import { FastifyAdapter } from "node-core-kit-adapter-fastify";
import { NodeHttpAdapter } from "node-core-kit-adapter-node";

const durationMs = Number(process.env.BENCH_DURATION_MS ?? 5000);
const concurrency = Number(process.env.BENCH_CONCURRENCY ?? 50);
const warmupMs = 1000;

function listenRaw(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

const scenarios = {
  "node:http (raw)": async () => {
    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ status: "ok" }));
    });
    const port = await listenRaw(server);

    return {
      url: `http://127.0.0.1:${port}/health`,
      close: () => new Promise((resolve) => server.close(resolve)),
    };
  },

  "fastify (raw)": async () => {
    const server = Fastify({ logger: false });
    server.get("/health", async () => ({ status: "ok" }));
    await server.listen({ port: 0, host: "127.0.0.1" });
    const port = server.server.address().port;

    return {
      url: `http://127.0.0.1:${port}/health`,
      close: () => server.close(),
    };
  },

  "NodeCore + Fastify adapter": async () =>
    nodeCore(new FastifyAdapter({ logger: false })),

  "NodeCore + Node adapter": async () => nodeCore(new NodeHttpAdapter()),
};

async function nodeCore(http) {
  const app = new Application({ http, port: 0, host: "127.0.0.1" });
  app.mapGet("/health", () => ({ status: "ok" }));
  await app.start();

  return {
    url: `http://127.0.0.1:${app.listeningPort}/health`,
    close: () => app.dispose(),
  };
}

async function generateLoad(url, duration) {
  const latencies = [];
  let errors = 0;
  const endAt = performance.now() + duration;

  async function worker() {
    while (performance.now() < endAt) {
      const startedAt = performance.now();

      try {
        const response = await fetch(url);
        await response.arrayBuffer();

        if (response.ok) {
          latencies.push(performance.now() - startedAt);
        } else {
          errors += 1;
        }
      } catch {
        errors += 1;
      }
    }
  }

  const startedAt = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsedSeconds = (performance.now() - startedAt) / 1000;

  latencies.sort((a, b) => a - b);

  return {
    requestsPerSecond: Math.round(latencies.length / elapsedSeconds),
    p50Ms: percentile(latencies, 0.5),
    p99Ms: percentile(latencies, 0.99),
    errors,
  };
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) {
    return NaN;
  }

  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * fraction) - 1,
  );
  return Number(sorted[index].toFixed(2));
}

const results = {};

for (const [name, start] of Object.entries(scenarios)) {
  const target = await start();

  try {
    await generateLoad(target.url, warmupMs);
    results[name] = await generateLoad(target.url, durationMs);
  } finally {
    await target.close();
  }

  console.log(`done: ${name}`);
}

console.log(
  `\nGET /health, ${concurrency} concurrent connections, ${durationMs / 1000}s per scenario\n`,
);
console.table(results);
